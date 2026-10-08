// Key Vault for one environment's secrets, using Azure RBAC (no access policies). Apps read
// secrets through a managed identity that is granted "Key Vault Secrets User" here.

@description('Azure region.')
param location string

@description('Key Vault name (3-24 letters, digits and hyphens, globally unique).')
@minLength(3)
@maxLength(24)
param vaultName string

@description('Tags applied to every resource.')
param tags object

@description('Principal ids (managed identities) that may read secrets.')
param secretReaderPrincipalIds array = []

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    // Container Apps on the consumption plan reach the vault over its public endpoint;
    // access still needs an Entra identity with a role on the vault.
    publicNetworkAccess: 'Enabled'
  }
}

// Key Vault Secrets User: read secret values, nothing else.
var secretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource readers 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in secretReaderPrincipalIds: {
    name: guid(vault.id, principalId, secretsUserRoleId)
    scope: vault
    properties: {
      principalId: principalId
      principalType: 'ServicePrincipal'
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsUserRoleId)
    }
  }
]

@description('Key Vault name.')
output name string = vault.name

@description('Vault URI, e.g. https://name.vault.azure.net/.')
output uri string = vault.properties.vaultUri
