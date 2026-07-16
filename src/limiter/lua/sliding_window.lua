local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local request_id = ARGV[4]

-- Remove elements older than (now - window)
local clear_before = now - window
redis.call('zremrangebyscore', key, '-inf', clear_before)

-- Count current elements
local current_requests = redis.call('zcard', key)

if current_requests < limit then
    -- Add current request
    local member = now .. ":" .. request_id
    redis.call('zadd', key, now, member)
    -- Set TTL to ensure key cleanup
    redis.call('pexpire', key, window)
    return {1, limit - current_requests - 1, now + window}
else
    -- Limit reached, get oldest element score to calculate reset time
    local oldest = redis.call('zrange', key, 0, 0, 'WITHSCORES')
    local oldest_time = now - window
    if oldest and oldest[2] then
        oldest_time = tonumber(oldest[2])
    end
    return {0, 0, oldest_time + window}
end
