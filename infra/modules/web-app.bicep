// Linux App Service running the Next.js standalone server. Only Azure Front Door (this
// environment's profile, checked by its X-Azure-FDID header) may reach the site; the SCM
// site stays reachable for zip deploys from the manual workflow. App settings are set by the
// caller once the Front Door address is known (AUTH_URL needs it).

@description('Azure region.')
param location string

@description('Prefix for resource names, e.g. "teckin-dev".')
param namePrefix string

@description('Tags applied to every resource.')
param tags object

@description('App Service plan SKU. B1 is enough to try it out; P0v3 or larger for classes.')
@allowed(['B1', 'B2', 'P0v3', 'P1v3', 'P2v3'])
param skuName string

@description('Instances of the web app. Next.js pages here are stateless, so this scales out.')
@minValue(1)
@maxValue(10)
param instanceCount int

@description('The Front Door profile id (its `frontDoorId` property) allowed to call the site.')
param frontDoorId string

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${namePrefix}-web-plan'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: skuName
    capacity: instanceCount
  }
  properties: {
    reserved: true
  }
}

resource site 'Microsoft.Web/sites@2024-04-01' = {
  name: '${namePrefix}-web'
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node apps/web/server.js'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/health'
      ipSecurityRestrictionsDefaultAction: 'Deny'
      ipSecurityRestrictions: [
        {
          name: 'front-door-only'
          action: 'Allow'
          priority: 100
          tag: 'ServiceTag'
          ipAddress: 'AzureFrontDoor.Backend'
          headers: {
            'x-azure-fdid': [frontDoorId]
          }
        }
      ]
      scmIpSecurityRestrictionsUseMain: false
    }
  }
}

@description('Web app name, for the deploy step.')
output siteName string = site.name

@description('Default host name, used as the Front Door origin.')
output defaultHostName string = site.properties.defaultHostName

@description('Principal id of the site\'s system-assigned identity, for Key Vault access.')
output principalId string = site.identity.principalId
