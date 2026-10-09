// The web app (Next.js on App Service), static game assets (Blob Storage) behind Azure Front
// Door, and Application Insights. Needs the platform template first: the app's secrets come
// from its Key Vault through Key Vault references. Written during the build and never run by
// it; see docs/DEPLOY.md for how Bryan deploys it.
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

// The Climber theme is not a parameter: Next.js bakes NEXT_PUBLIC_* values in at build time,
// so the deploy workflow sets it from the CLIMBER_THEME variable.
@description('Object id of the deploy identity. When set, it may upload game assets.')
param deployPrincipalId string = ''

@description('Public address of the site, e.g. https://teckin.example.org, when a custom domain is set up on Front Door. Empty uses the Front Door endpoint address.')
param publicSiteUrl string = ''

@description('Realtime entry URL printed by "Deploy realtime" (the web server launches games there). Empty falls back to NEXT_PUBLIC_REALTIME_URL baked into the build.')
param realtimeUrl string = ''

@description('True once the platform\'s Key Vault holds the email-server secret (SMTP for sign-in links).')
param emailConfigured bool = false

@description('Sender for sign-in emails. Empty uses DoNotReply on the Azure-managed email domain.')
param emailFrom string = ''

@description('Google sign-in client id. Set it only after Deploy platform stored AUTH_GOOGLE_SECRET in Key Vault.')
param googleClientId string = ''

@description('Microsoft sign-in client id. Set it only after Deploy platform stored AUTH_MICROSOFT_ENTRA_ID_SECRET in Key Vault.')
param microsoftClientId string = ''

@description('Microsoft issuer for one tenant, e.g. https://login.microsoftonline.com/<tenant id>/v2.0. Empty accepts any Microsoft account.')
param microsoftIssuer string = ''

@description('Optional sign-in attempt limits per 15 minutes (per network address, per email address). 0 keeps the app defaults (30 and 5).')
@minValue(0)
param signInLimitPerAddress int = 0

@minValue(0)
param signInLimitPerEmail int = 0

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
    frontDoorId: frontDoor.properties.frontDoorId
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

// Created by the platform template; the same name formula finds it.
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: take('${productName}-${environmentName}-${uniqueString(resourceGroup().id)}', 24)
}

// Key Vault Secrets User for the site's own identity, so its Key Vault references resolve.
var secretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource webCanReadSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, '${namePrefix}-web', secretsUserRoleId)
  scope: vault
  properties: {
    principalId: web.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsUserRoleId)
  }
}

resource managedEmailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' existing = {
  name: '${namePrefix}-email/AzureManagedDomain'
}

/** A Key Vault reference App Service resolves with the site's identity. */
func keyVaultReference(vaultName string, secretName string) string =>
  '@Microsoft.KeyVault(VaultName=${vaultName};SecretName=${secretName})'

var siteUrl = empty(publicSiteUrl) ? 'https://${edge.outputs.hostName}' : publicSiteUrl

var appSettings = union(
  {
    APPLICATIONINSIGHTS_CONNECTION_STRING: monitoring.outputs.appInsightsConnectionString
    // The standalone Next.js server reads PORT (set by App Service) and HOSTNAME.
    HOSTNAME: '0.0.0.0'
    NODE_ENV: 'production'
    NEXT_TELEMETRY_DISABLED: '1'
    // The package is prebuilt by the workflow; App Service must not run npm install.
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    DATABASE_URL: keyVaultReference(vault.name, 'database-url')
    AUTH_SECRET: keyVaultReference(vault.name, 'auth-secret')
    AUTH_URL: siteUrl
    // Front Door sits in front; Auth.js builds links from AUTH_URL, not the origin host.
    AUTH_TRUST_HOST: 'true'
    // Front Door and App Service's front end each append to X-Forwarded-For; the caller's
    // address for rate limits is the entry before both (lib/server/platform.ts).
    TRUSTED_PROXY_COUNT: '2'
    REALTIME_SHARED_SECRET: keyVaultReference(vault.name, 'realtime-shared-secret')
    EMAIL_FROM: empty(emailFrom)
      ? 'Teckin <DoNotReply@${managedEmailDomain.properties.mailFromSenderDomain}>'
      : emailFrom
  },
  emailConfigured ? { EMAIL_SERVER: keyVaultReference(vault.name, 'email-server') } : {},
  empty(realtimeUrl) ? {} : { REALTIME_INTERNAL_URL: realtimeUrl },
  empty(googleClientId)
    ? {}
    : {
        AUTH_GOOGLE_ID: googleClientId
        AUTH_GOOGLE_SECRET: keyVaultReference(vault.name, 'auth-google-secret')
      },
  empty(microsoftClientId)
    ? {}
    : {
        AUTH_MICROSOFT_ENTRA_ID_ID: microsoftClientId
        AUTH_MICROSOFT_ENTRA_ID_SECRET: keyVaultReference(vault.name, 'auth-microsoft-secret')
      },
  empty(microsoftIssuer) ? {} : { AUTH_MICROSOFT_ENTRA_ID_ISSUER: microsoftIssuer },
  signInLimitPerAddress > 0 ? { SIGN_IN_LIMIT_PER_ADDRESS: string(signInLimitPerAddress) } : {},
  signInLimitPerEmail > 0 ? { SIGN_IN_LIMIT_PER_EMAIL: string(signInLimitPerEmail) } : {}
)

resource site 'Microsoft.Web/sites@2024-04-01' existing = {
  name: '${namePrefix}-web'
}

resource siteAppSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: site
  name: 'appsettings'
  dependsOn: [webCanReadSecrets]
  properties: appSettings
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

@description('The address hosts use (AUTH_URL).')
output publicSiteUrl string = siteUrl
