// Phase 3 infrastructure: the Colyseus realtime server on Azure Container Apps, Azure Managed
// Redis for presence and join codes, Key Vault for secrets, and a container registry. Written
// during the build and never run by it; see infra/README.md for how Bryan deploys it.
//
// Scaling (docs/DECISIONS.md): `shardCount` single-replica Container Apps, each with its own
// host name passed to Colyseus as its public address, all sharing Redis. Any process can look
// up a join code and reserve a seat; the phone then opens its WebSocket on the process that
// holds the room. Raise `shardCount` for more concurrent games.
targetScope = 'resourceGroup'

@description('Environment name, used in resource names and tags.')
@allowed(['dev', 'staging', 'prod'])
param environmentName string = 'dev'

@description('Azure region for regional resources.')
param location string = resourceGroup().location

@description('Short product prefix for resource names.')
@minLength(2)
@maxLength(10)
param productName string = 'teckin'

@description('Realtime processes (one Container App each). One process holds about 10 rooms of 30 comfortably; see docs/load-test.md.')
@minValue(1)
@maxValue(20)
param shardCount int = 1

@description('vCPU per realtime process.')
@allowed(['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'])
param shardCpu string = '0.5'

@description('Memory per realtime process; must match the vCPU (2Gi per vCPU).')
@allowed(['0.5Gi', '1Gi', '1.5Gi', '2Gi', '2.5Gi', '3Gi', '4Gi'])
param shardMemory string = '1Gi'

@description('Azure Managed Redis SKU.')
@allowed(['Balanced_B0', 'Balanced_B1', 'Balanced_B3', 'Balanced_B5'])
param redisSkuName string = 'Balanced_B0'

@description('Replicate Redis across two nodes.')
param redisHighAvailability bool = false

@description('Realtime image tag in this environment\'s registry. Empty deploys the shared resources only (the first run, before an image exists).')
param realtimeImageTag string = ''

@description('Secret for the temporary /dev/new-game page (Phase 3 only). Empty switches dev game creation off.')
@secure()
param devGameSecret string = ''

@description('Object id of the deploy identity. When set, it may push images to the registry.')
param deployPrincipalId string = ''

var namePrefix = '${productName}-${environmentName}'
var tags = {
  product: productName
  environment: environmentName
}
var uniqueSuffix = uniqueString(resourceGroup().id)
// Registry names allow letters and digits only; vault names at most 24 characters.
var registryName = take('${productName}${environmentName}${uniqueSuffix}', 50)
var vaultName = take('${productName}-${environmentName}-${uniqueSuffix}', 24)
var realtimeImageName = '${productName}-realtime'

module monitoring '../modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-realtime-identity'
  location: location
  tags: tags
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    // Pulls and pushes use Entra identities, never the admin user.
    adminUserEnabled: false
  }
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'

resource identityCanPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleId)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

resource deployCanPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployPrincipalId)) {
  name: guid(registry.id, deployPrincipalId, acrPushRoleId)
  scope: registry
  properties: {
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPushRoleId)
  }
}

module redis '../modules/managed-redis.bicep' = {
  name: 'managed-redis'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    skuName: redisSkuName
    highAvailability: redisHighAvailability
  }
}

module keyVault '../modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    location: location
    vaultName: vaultName
    tags: tags
    secretReaderPrincipalIds: [identity.properties.principalId]
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: vaultName
}

resource redisDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-04-01' existing = {
  name: '${namePrefix}-redis/default'
}

// The Redis URL (with its access key) exists only inside Key Vault and the running app.
resource redisUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'redis-url'
  dependsOn: [keyVault]
  properties: {
    value: 'rediss://:${redisDatabase.listKeys().primaryKey}@${redis.outputs.hostName}:10000'
    contentType: 'text/plain'
  }
}

resource devGameSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(devGameSecret)) {
  parent: vault
  name: 'dev-game-secret'
  dependsOn: [keyVault]
  properties: {
    value: devGameSecret
    contentType: 'text/plain'
  }
}

// Created by the monitoring module; referenced by name so its keys can be read.
resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: '${namePrefix}-logs'
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-apps'
  location: location
  tags: tags
  dependsOn: [monitoring]
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logWorkspace.properties.customerId
        sharedKey: logWorkspace.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

module shards '../modules/realtime-shard.bicep' = [
  for index in range(1, shardCount): if (!empty(realtimeImageTag)) {
    name: 'realtime-shard-${index}'
    dependsOn: [identityCanPull, keyVault]
    params: {
      location: location
      appName: '${namePrefix}-rt-${index}'
      tags: tags
      environmentId: containerEnvironment.id
      environmentDefaultDomain: containerEnvironment.properties.defaultDomain
      image: '${registry.properties.loginServer}/${realtimeImageName}:${realtimeImageTag}'
      registryServer: registry.properties.loginServer
      identityId: identity.id
      redisUrlSecretUri: redisUrlSecret.properties.secretUri
      devGameSecretUri: empty(devGameSecret) ? '' : devGameSecretValue!.properties.secretUri
      appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
      cpu: shardCpu
      memory: shardMemory
    }
  }
]

@description('Registry login server the workflow pushes the realtime image to.')
output registryLoginServer string = registry.properties.loginServer

@description('Registry name, for `az acr login`.')
output registryName string = registry.name

@description('Realtime image repository name.')
output realtimeImageName string = realtimeImageName

@description('Public host names of the realtime processes, for health checks after a deploy.')
output shardHostNames array = [
  for index in range(1, shardCount): '${namePrefix}-rt-${index}.${containerEnvironment.properties.defaultDomain}'
]

@description('Entry address for the web app (NEXT_PUBLIC_REALTIME_URL): any process can resolve codes and reserve seats; the first is used.')
output realtimeEntryUrl string = 'https://${namePrefix}-rt-1.${containerEnvironment.properties.defaultDomain}'

@description('Key Vault name.')
output keyVaultName string = keyVault.outputs.name
