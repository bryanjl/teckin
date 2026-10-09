using './main.bicep'

param environmentName = 'dev'
param postgresTier = 'Burstable'
param postgresSkuName = 'Standard_B1ms'
param postgresStorageSizeGB = 32
param postgresBackupRetentionDays = 7
param postgresHighAvailability = false
param communicationDataLocation = 'Europe'
// The deploy workflow passes the secrets (postgresAdministratorPassword, realtimeSharedSecret,
// authSecret, emailServer and the optional sign-in provider secrets) from GitHub environment secrets; placeholders keep this file valid.
param postgresAdministratorPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', 'placeholder-not-a-password')
param realtimeSharedSecret = readEnvironmentVariable('REALTIME_SHARED_SECRET', 'placeholder-not-a-secret-0123456789abcdef')
param authSecret = readEnvironmentVariable('AUTH_SECRET', 'placeholder-not-a-secret-0123456789abcdef')
param emailServer = readEnvironmentVariable('EMAIL_SERVER', '')
param googleClientSecret = readEnvironmentVariable('AUTH_GOOGLE_SECRET', '')
param microsoftClientSecret = readEnvironmentVariable('AUTH_MICROSOFT_ENTRA_ID_SECRET', '')
