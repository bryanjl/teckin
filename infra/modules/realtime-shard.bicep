// One realtime process: a Container App pinned to exactly one replica with its own public
// host name. Colyseus keeps each room in one process, and the seat reservation tells the
// phone which address to open its WebSocket on (REALTIME_PUBLIC_ADDRESS), so every process
// needs an address of its own. Container Apps' shared ingress cannot pick a replica, hence
// one app per process instead of replicas. See docs/DECISIONS.md (scaling decision).

@description('Azure region.')
param location string

@description('Container App name, e.g. "teckin-dev-rt-1". Becomes the first label of its host name.')
@maxLength(32)
param appName string

@description('Tags applied to every resource.')
param tags object

@description('Container Apps environment resource id.')
param environmentId string

@description('The environment default domain; with the app name it gives this process its host name.')
param environmentDefaultDomain string

@description('Full image reference, e.g. "teckinacr.azurecr.io/teckin-realtime:<commit>".')
param image string

@description('Registry login server the image is pulled from.')
param registryServer string

@description('User-assigned identity (resource id) that pulls the image and reads Key Vault.')
param identityId string

@description('Key Vault secret URI holding the Redis connection URL.')
param redisUrlSecretUri string

@description('Key Vault secret URI of the secret shared with the web app.')
param sharedSecretUri string

@description('Key Vault secret URI of the database URL; games are recorded for reports there.')
param databaseUrlSecretUri string

@description('Months players\' answers are kept before the in-process retention job deletes them.')
param playerDataRetentionMonths int = 12

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('vCPU for the process. Node runs game logic on one core, so more than 1 buys little.')
param cpu string = '0.5'

@description('Memory for the process, matching the CPU (Container Apps pairs 0.5 vCPU with 1Gi).')
param memory string = '1Gi'

var publicHostName = '${appName}.${environmentDefaultDomain}'
var port = 2567

var keyVaultSecrets = [
  {
    name: 'redis-url'
    keyVaultUrl: redisUrlSecretUri
    identity: identityId
  }
  {
    name: 'realtime-shared-secret'
    keyVaultUrl: sharedSecretUri
    identity: identityId
  }
  {
    name: 'database-url'
    keyVaultUrl: databaseUrlSecretUri
    identity: identityId
  }
]

var environmentVariables = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'REALTIME_HOST', value: '0.0.0.0' }
  { name: 'REALTIME_PORT', value: string(port) }
  { name: 'REALTIME_PUBLIC_ADDRESS', value: publicHostName }
  { name: 'REDIS_URL', secretRef: 'redis-url' }
  { name: 'REALTIME_SHARED_SECRET', secretRef: 'realtime-shared-secret' }
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'PLAYER_DATA_RETENTION_MONTHS', value: string(playerDataRetentionMonths) }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: port
        // HTTP/1.1 with WebSocket upgrades; plain HTTP is redirected to HTTPS.
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registryServer
          identity: identityId
        }
      ]
      secrets: keyVaultSecrets
    }
    template: {
      // Gives Colyseus time to tell clients the room is closing when a revision replaces it.
      terminationGracePeriodSeconds: 30
      containers: [
        {
          name: 'realtime'
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: environmentVariables
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: port
              }
              periodSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: port
              }
              periodSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      // Exactly one process per app: rooms live in memory and players reconnect to this
      // address, so the platform must never add or swap replicas on its own.
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

@description('Public host name of this process (its Colyseus public address).')
output hostName string = publicHostName

@description('Container App name.')
output name string = app.name
