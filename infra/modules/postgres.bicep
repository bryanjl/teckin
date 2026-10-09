// Azure Database for PostgreSQL Flexible Server holding the product database (hosts, question
// sets, games, players' answers, results). Password authentication with an admin login whose
// password comes from the deploy workflow's secret; the apps get the connection URL from Key
// Vault. Reached over its public endpoint with TLS required: Azure-hosted callers (the web app
// and the realtime processes) are allowed, and the deploy workflow opens a temporary rule for
// its runner while it applies migrations. See docs/DEPLOY.md for moving to private networking.

@description('Azure region.')
param location string

@description('Server name (globally unique, lowercase letters, digits and hyphens).')
@minLength(3)
@maxLength(63)
param serverName string

@description('Tags applied to every resource.')
param tags object

@description('Compute tier.')
@allowed(['Burstable', 'GeneralPurpose', 'MemoryOptimized'])
param tier string

@description('Compute size, e.g. Standard_B1ms (Burstable) or Standard_D2ds_v5 (GeneralPurpose).')
param skuName string

@description('Storage in GiB. It can grow later but never shrink.')
@allowed([32, 64, 128, 256, 512])
param storageSizeGB int

@description('Days of point-in-time restore.')
@minValue(7)
@maxValue(35)
param backupRetentionDays int

@description('Standby replica in another availability zone (GeneralPurpose or MemoryOptimized only).')
param highAvailability bool = false

@description('Administrator login name.')
param administratorLogin string

@description('Administrator password.')
@secure()
param administratorPassword string

@description('Database the apps use.')
param databaseName string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: tier
  }
  properties: {
    version: '17'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: highAvailability ? 'ZoneRedundant' : 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// 0.0.0.0 is Azure's special rule for "connections from Azure services", which is how App
// Service and Container Apps on shared outbound addresses reach the server.
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

@description('Server name.')
output name string = server.name

@description('Server host name, e.g. name.postgres.database.azure.com.')
output hostName string = server.properties.fullyQualifiedDomainName

@description('Database name.')
output databaseName string = database.name
