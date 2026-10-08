// Front Door endpoint, origins and routes for an existing profile: /game-assets/* from blob
// storage (cached for a day), everything else from the web app. Next.js hashed build files
// under /_next/static/* are cached too; pages and APIs are not.

@description('Name of the Front Door profile created by the caller.')
param profileName string

@description('Prefix for resource names, e.g. "teckin-dev".')
param namePrefix string

@description('Web app host name (origin for pages and APIs).')
param webHostName string

@description('Blob endpoint host name (origin for game assets).')
param assetsHostName string

resource profile 'Microsoft.Cdn/profiles@2024-09-01' existing = {
  name: profileName
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-09-01' = {
  parent: profile
  name: '${namePrefix}-edge'
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource webOrigins 'Microsoft.Cdn/profiles/originGroups@2024-09-01' = {
  parent: profile
  name: 'web'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/api/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 60
    }
  }
}

resource webOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-09-01' = {
  parent: webOrigins
  name: 'web-app'
  properties: {
    hostName: webHostName
    originHostHeader: webHostName
    httpsPort: 443
    priority: 1
    weight: 1000
    enforceCertificateNameCheck: true
  }
}

resource assetOrigins 'Microsoft.Cdn/profiles/originGroups@2024-09-01' = {
  parent: profile
  name: 'assets'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
  }
}

resource assetOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-09-01' = {
  parent: assetOrigins
  name: 'blob'
  properties: {
    hostName: assetsHostName
    originHostHeader: assetsHostName
    httpsPort: 443
    priority: 1
    weight: 1000
    enforceCertificateNameCheck: true
  }
}

resource assetRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-09-01' = {
  parent: endpoint
  name: 'game-assets'
  dependsOn: [assetOrigin]
  properties: {
    originGroup: { id: assetOrigins.id }
    patternsToMatch: ['/game-assets/*']
    supportedProtocols: ['Https']
    httpsRedirect: 'Disabled'
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    cacheConfiguration: {
      queryStringCachingBehavior: 'IgnoreQueryString'
      compressionSettings: {
        isCompressionEnabled: true
        contentTypesToCompress: ['application/json', 'image/svg+xml']
      }
    }
  }
}

resource staticRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-09-01' = {
  parent: endpoint
  name: 'next-static'
  dependsOn: [webOrigin]
  properties: {
    originGroup: { id: webOrigins.id }
    patternsToMatch: ['/_next/static/*']
    supportedProtocols: ['Https']
    httpsRedirect: 'Disabled'
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    cacheConfiguration: {
      queryStringCachingBehavior: 'UseQueryString'
      compressionSettings: {
        isCompressionEnabled: true
        contentTypesToCompress: ['application/javascript', 'text/css']
      }
    }
  }
}

resource webRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-09-01' = {
  parent: endpoint
  name: 'web'
  dependsOn: [webOrigin]
  properties: {
    originGroup: { id: webOrigins.id }
    patternsToMatch: ['/*']
    supportedProtocols: ['Http', 'Https']
    httpsRedirect: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
  }
}

@description('Public host name of the site, e.g. teckin-dev-edge-abc123.z01.azurefd.net.')
output hostName string = endpoint.properties.hostName
