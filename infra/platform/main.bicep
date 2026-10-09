// Shared platform for one environment, deployed before the realtime and web templates: Key
// Vault with the apps' secrets, PostgreSQL Flexible Server and Communication Services Email.
// Written during the build and never run by it; see docs/DEPLOY.md for how Bryan deploys it.
//
// Secrets live only in Key Vault. The realtime template grants its identity read access and
// adds the Redis URL; the web template grants the web app's identity read access and refers
// to the secrets from its app settings.
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

@description('PostgreSQL compute tier.')
@allowed(['Burstable', 'GeneralPurpose', 'MemoryOptimized'])
param postgresTier string = 'Burstable'

@description('PostgreSQL compute size.')
param postgresSkuName string = 'Standard_B1ms'

@description('PostgreSQL storage in GiB.')
@allowed([32, 64, 128, 256, 512])
param postgresStorageSizeGB int = 32

@description('PostgreSQL point-in-time restore window in days.')
@minValue(7)
@maxValue(35)
param postgresBackupRetentionDays int = 7

@description('PostgreSQL zone-redundant standby (not available on Burstable).')
param postgresHighAvailability bool = false

@description('PostgreSQL administrator login. The apps use it too (see docs/DEPLOY.md, hardening).')
param postgresAdministratorLogin string = 'teckinadmin'

@description('PostgreSQL administrator password (GitHub secret POSTGRES_ADMIN_PASSWORD).')
@secure()
@minLength(16)
param postgresAdministratorPassword string

@description('Secret shared by the web app and the realtime server (GitHub secret REALTIME_SHARED_SECRET, at least 32 characters).')
@secure()
@minLength(32)
param realtimeSharedSecret string

@description('Auth.js session signing secret (GitHub secret AUTH_SECRET, at least 32 characters).')
@secure()
@minLength(32)
param authSecret string

@description('SMTP URL for sign-in emails (GitHub secret EMAIL_SERVER), e.g. smtp://user:password@smtp.azurecomm.net:587. Empty until the SMTP sender exists (docs/DEPLOY.md); without it nobody can sign in by email.')
@secure()
param emailServer string = ''

@description('Google sign-in client secret (GitHub secret AUTH_GOOGLE_SECRET). Empty leaves Google sign-in off.')
@secure()
param googleClientSecret string = ''

@description('Microsoft sign-in client secret (GitHub secret AUTH_MICROSOFT_ENTRA_ID_SECRET). Empty leaves Microsoft sign-in off.')
@secure()
param microsoftClientSecret string = ''

@description('Where Communication Services keeps its data at rest.')
@allowed(['Africa', 'Asia Pacific', 'Australia', 'Brazil', 'Canada', 'Europe', 'France', 'Germany', 'India', 'Japan', 'Korea', 'Norway', 'Switzerland', 'UAE', 'UK', 'United States'])
param communicationDataLocation string = 'Europe'

var namePrefix = '${productName}-${environmentName}'
var tags = {
  product: productName
  environment: environmentName
}
var uniqueSuffix = uniqueString(resourceGroup().id)
// The realtime and web templates derive the same vault name to find it.
var vaultName = take('${productName}-${environmentName}-${uniqueSuffix}', 24)
var postgresServerName = '${namePrefix}-db-${take(uniqueSuffix, 6)}'
var databaseName = 'teckin'

module keyVault '../modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    location: location
    vaultName: vaultName
    tags: tags
  }
}

module postgres '../modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    location: location
    serverName: postgresServerName
    tags: tags
    tier: postgresTier
    skuName: postgresSkuName
    storageSizeGB: postgresStorageSizeGB
    backupRetentionDays: postgresBackupRetentionDays
    highAvailability: postgresHighAvailability
    administratorLogin: postgresAdministratorLogin
    administratorPassword: postgresAdministratorPassword
    databaseName: databaseName
  }
}

module email '../modules/communication-email.bicep' = {
  name: 'communication-email'
  params: {
    namePrefix: namePrefix
    tags: tags
    dataLocation: communicationDataLocation
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: vaultName
}

// verify-full: node-postgres checks the server certificate (Azure's chain is publicly trusted).
resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  dependsOn: [keyVault]
  properties: {
    value: 'postgresql://${postgresAdministratorLogin}:${uriComponent(postgresAdministratorPassword)}@${postgres.outputs.hostName}:5432/${databaseName}?sslmode=verify-full'
    contentType: 'text/plain'
  }
}

resource realtimeSharedSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'realtime-shared-secret'
  dependsOn: [keyVault]
  properties: {
    value: realtimeSharedSecret
    contentType: 'text/plain'
  }
}

resource authSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'auth-secret'
  dependsOn: [keyVault]
  properties: {
    value: authSecret
    contentType: 'text/plain'
  }
}

// Written once the SMTP sender exists; the web template refers to it only then.
resource emailServerValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(emailServer)) {
  parent: vault
  name: 'email-server'
  dependsOn: [keyVault]
  properties: {
    value: emailServer
    contentType: 'text/plain'
  }
}

resource googleClientSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(googleClientSecret)) {
  parent: vault
  name: 'auth-google-secret'
  dependsOn: [keyVault]
  properties: {
    value: googleClientSecret
    contentType: 'text/plain'
  }
}

resource microsoftClientSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(microsoftClientSecret)) {
  parent: vault
  name: 'auth-microsoft-secret'
  dependsOn: [keyVault]
  properties: {
    value: microsoftClientSecret
    contentType: 'text/plain'
  }
}

@description('Key Vault name.')
output keyVaultName string = keyVault.outputs.name

@description('PostgreSQL server name, for the workflow\'s temporary firewall rule.')
output postgresServerName string = postgres.outputs.name

@description('PostgreSQL administrator login, for the migration step.')
output postgresAdministratorLogin string = postgresAdministratorLogin

@description('PostgreSQL host name.')
output postgresHostName string = postgres.outputs.hostName

@description('Database name.')
output databaseName string = postgres.outputs.databaseName

@description('Communication Services resource name (first part of the SMTP user name).')
output communicationServiceName string = email.outputs.communicationServiceName

@description('Communication Services resource id, where the SMTP sender gets its role.')
output communicationServiceId string = email.outputs.communicationServiceId

@description('Sender address for EMAIL_FROM.')
output emailSenderAddress string = email.outputs.senderAddress
