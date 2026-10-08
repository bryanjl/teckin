using './main.bicep'

param environmentName = 'prod'
// Three 1-vCPU processes: about 60 concurrent rooms of 30 at the load measured in
// docs/load-test.md, with each process near 40% CPU.
param shardCount = 3
param shardCpu = '1'
param shardMemory = '2Gi'
param redisSkuName = 'Balanced_B1'
param redisHighAvailability = true
// The deploy workflow passes realtimeImageTag, realtimeSharedSecret and deployPrincipalId.
