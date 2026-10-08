using './main.bicep'

param environmentName = 'dev'
param shardCount = 1
param shardCpu = '0.5'
param shardMemory = '1Gi'
param redisSkuName = 'Balanced_B0'
param redisHighAvailability = false
// The deploy workflow passes realtimeImageTag, realtimeSharedSecret and deployPrincipalId.
