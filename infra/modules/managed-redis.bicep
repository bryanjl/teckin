// Azure Managed Redis for Colyseus presence, the matchmaker driver and join codes. Azure
// Cache for Redis (the spec's original choice) is being retired, so new deployments use its
// successor; see docs/DECISIONS.md. One TLS endpoint with the Enterprise clustering policy,
// so the server's plain (non-cluster) Redis client works unchanged.

@description('Azure region.')
param location string

@description('Prefix for resource names, e.g. "teckin-dev".')
param namePrefix string

@description('Tags applied to every resource.')
param tags object

@description('Managed Redis SKU. Balanced_B0 is the smallest; Balanced_B1 or larger for many classes.')
@allowed(['Balanced_B0', 'Balanced_B1', 'Balanced_B3', 'Balanced_B5'])
param skuName string = 'Balanced_B0'

@description('Replicate across two nodes. Off in dev to halve the cost.')
param highAvailability bool = false

resource cluster 'Microsoft.Cache/redisEnterprise@2025-04-01' = {
  name: '${namePrefix}-redis'
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  properties: {
    minimumTlsVersion: '1.2'
    highAvailability: highAvailability ? 'Enabled' : 'Disabled'
  }
}

resource database 'Microsoft.Cache/redisEnterprise/databases@2025-04-01' = {
  parent: cluster
  name: 'default'
  properties: {
    clientProtocol: 'Encrypted'
    port: 10000
    clusteringPolicy: 'EnterpriseCluster'
    // Presence and join codes must never be evicted to make room.
    evictionPolicy: 'NoEviction'
    // The Colyseus Redis client signs in with a key, kept only in Key Vault.
    accessKeysAuthentication: 'Enabled'
  }
}

@description('Managed Redis cluster name.')
output clusterName string = cluster.name

@description('Redis host name (TLS on port 10000).')
output hostName string = cluster.properties.hostName
