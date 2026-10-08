using './main.bicep'

param environmentName = 'prod'
// Three processes: about 30 concurrent rooms of 30 at the measured load, with headroom.
param shardCount = 3
param shardCpu = '1'
param shardMemory = '2Gi'
param redisSkuName = 'Balanced_B1'
param redisHighAvailability = true
// The deploy workflow passes realtimeImageTag and deployPrincipalId. Leave devGameSecret
// empty in prod: Phase 4 replaces /dev/new-game with signed-in hosts.
