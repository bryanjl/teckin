// Linux App Service running the Next.js standalone server. Only Azure Front Door (this
// environment's profile, checked by its X-Azure-FDID header) may reach the site; the SCM
// site stays reachable for zip deploys from the manual workflow.

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

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('The Front Door profile id (its `frontDoorId` property) allowed to call the site.')
param frontDoorId string

@description('Extra runtime app settings. NEXT_PUBLIC_* values do nothing here: Next.js bakes them in at build time.')
param extraAppSettings object = {}

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

var baseAppSettings = {
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  // The standalone Next.js server reads PORT (set by App Service) and HOSTNAME.
  HOSTNAME: '0.0.0.0'
  NODE_ENV: 'production'
  NEXT_TELEMETRY_DISABLED: '1'
  // The package is prebuilt by the workflow; App Service must not run npm install.
  SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
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
      appSettings: [
        for setting in items(union(baseAppSettings, extraAppSettings)): {
          name: setting.key
          value: string(setting.value)
        }
      ]
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
