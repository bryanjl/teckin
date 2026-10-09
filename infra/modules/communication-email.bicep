// Azure Communication Services Email for host sign-in links: an Email Communication Service with
// an Azure-managed sender domain (DoNotReply@<id>.azurecomm.net) linked to a Communication
// Services resource. The web app sends through its SMTP relay (EMAIL_SERVER); SMTP sign-in
// needs an Entra app registration, which Bicep cannot create, so docs/DEPLOY.md walks through
// that step. A custom domain (e.g. teckin.example.org) can replace the managed one later.

@description('Prefix for resource names, e.g. "teckin-dev".')
param namePrefix string

@description('Tags applied to every resource.')
param tags object

@description('Where Communication Services stores its data at rest, e.g. "Europe", "United Kingdom" or "United States".')
param dataLocation string

resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: '${namePrefix}-email'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: dataLocation
  }
}

resource managedDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  tags: tags
  properties: {
    domainManagement: 'AzureManaged'
    // Sign-in emails carry no tracking pixels or rewritten links.
    userEngagementTracking: 'Disabled'
  }
}

resource communication 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: '${namePrefix}-communication'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: dataLocation
    linkedDomains: [managedDomain.id]
  }
}

@description('Communication Services resource name; the first part of the SMTP user name.')
output communicationServiceName string = communication.name

@description('Communication Services resource id, the scope of the SMTP sender\'s role assignment.')
output communicationServiceId string = communication.id

@description('Sender address for EMAIL_FROM on the Azure-managed domain.')
output senderAddress string = 'DoNotReply@${managedDomain.properties.mailFromSenderDomain}'
