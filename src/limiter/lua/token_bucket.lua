local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Retrieve current bucket values
local data = redis.call('HMGET', key, 'tokens', 'last_updated')
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if tokens == nil or last_updated == nil then
  -- First request: Initialize bucket with full capacity
  tokens = limit
  last_updated = now
else
  -- Calculate elapsed milliseconds and refill tokens
  local elapsed = now - last_updated
  if elapsed > 0 then
    local refill_rate = limit / windowMs
    tokens = math.min(limit, tokens + (elapsed * refill_rate))
    last_updated = now
  end
end

-- Evaluate allocation request
if tokens >= 1 then
  -- Consume 1 token
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'last_updated', last_updated)
  redis.call('PEXPIRE', key, windowMs)
  return {1, math.floor(tokens), 0} -- [allowed, remaining, reset_at]
else
  -- Calculate millisecond cooldown required to refill to 1 token
  local refill_rate = limit / windowMs
  local time_to_next = math.ceil((1 - tokens) / refill_rate)
  local reset_at = now + time_to_next
  return {0, 0, reset_at} -- [blocked, remaining, reset_at]
end
