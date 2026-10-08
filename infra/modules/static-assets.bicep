// Storage for static game assets (theme atlases and manifests). Front Door serves the
// `game-assets` container at /game-assets/*, so the browser fetches them from the same
// origin as the page and no CORS rules are needed.

@description('Azure region.')
param location string

@description('Globally unique storage account name: 3-24 lowercase letters and digits.')
@minLength(3)
@maxLength(24)
param storageAccountName string

@description('Tags applied to every resource.')
param tags object

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // Only the game-assets container is public, and it holds nothing but built art.
    allowBlobPublicAccess: true
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'game-assets'
  properties: {
    publicAccess: 'Blob'
  }
}

@description('Storage account name, for the upload step.')
output storageAccountName string = account.name

@description('Blob endpoint host name, used as the Front Door origin.')
output blobHostName string = replace(replace(account.properties.primaryEndpoints.blob, 'https://', ''), '/', '')
