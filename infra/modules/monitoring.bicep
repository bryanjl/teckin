// Log Analytics workspace and workspace-based Application Insights, shared by every app in an
// environment. Later phases pass `appInsightsConnectionString` to the realtime server too.

@description('Azure region.')
param location string

@description('Prefix for resource names, e.g. "teckin-dev".')
param namePrefix string

@description('Tags applied to every resource.')
param tags object

@description('Days to keep logs. Short by default: logs may hold request metadata from children.')
@minValue(30)
@maxValue(730)
param logRetentionDays int = 30

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: logRetentionDays
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-insights'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    // Players' IP addresses are never stored with telemetry.
    DisableIpMasking: false
  }
}

@description('Connection string for Application Insights SDKs.')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('Log Analytics workspace resource id, for diagnostic settings.')
output workspaceId string = workspace.id
