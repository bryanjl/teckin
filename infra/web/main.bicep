// Phase 1 infrastructure: the web app (Next.js on App Service), static game assets (Blob
// Storage) behind Azure Front Door, and Application Insights. Written during the build and
// never run by it; see infra/README.md for how Bryan deploys it.
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

@description('App Service plan SKU.')
@allowed(['B1', 'B2', 'P0v3', 'P1v3', 'P2v3'])
param webSkuName string = 'B1'

@description('Web app instances.')
@minValue(1)
@maxValue(10)
param webInstanceCount int = 1

@description('Theme pack the Climber game uses by default.')
param climberTheme string = 'placeholder'

@description('Object id of the deploy identity. When set, it may upload game assets.')
param deployPrincipalId string = ''

var namePrefix = '${productName}-${environmentName}'
var tags = {
  product: productName
  environment: environmentName
}
// Storage names allow only lowercase letters and digits; the suffix keeps them unique.
var storageAccountName = take('${productName}${environmentName}${uniqueString(resourceGroup().id)}', 24)

module monitoring '../modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
  }
}

module assets '../modules/static-assets.bicep' = {
  name: 'static-assets'
  params: {
    location: location
    storageAccountName: storageAccountName
    tags: tags
  }
}

resource frontDoor 'Microsoft.Cdn/profiles@2024-09-01' = {
  name: '${namePrefix}-frontdoor'
  location: 'global'
  tags: tags
  sku: { name: 'Standard_AzureFrontDoor' }
}

module web '../modules/web-app.bicep' = {
  name: 'web-app'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    skuName: webSkuName
    instanceCount: webInstanceCount
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    frontDoorId: frontDoor.properties.frontDoorId
    extraAppSettings: {
      NEXT_PUBLIC_CLIMBER_THEME: climberTheme
    }
  }
}

module edge '../modules/front-door.bicep' = {
  name: 'front-door'
  params: {
    profileName: frontDoor.name
    namePrefix: namePrefix
    webHostName: web.outputs.defaultHostName
    assetsHostName: assets.outputs.blobHostName
  }
}

// Storage Blob Data Contributor, so the workflow can upload assets without account keys.
var blobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource deployCanUploadAssets 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployPrincipalId)) {
  name: guid(storageAccountName, deployPrincipalId, blobDataContributorRoleId)
  scope: storageAccount
  dependsOn: [assets]
  properties: {
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributorRoleId)
  }
}

@description('Web app name, for zip deploy.')
output webAppName string = web.outputs.siteName

@description('Storage account holding the game-assets container.')
output assetsStorageAccountName string = assets.outputs.storageAccountName

@description('Public URL of the site through Front Door.')
output siteUrl string = 'https://${edge.outputs.hostName}'
