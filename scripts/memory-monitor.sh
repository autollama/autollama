#!/bin/bash
# AutoLlama Memory Monitoring Script
# Check container memory usage and system health

echo "=== AutoLlama Memory Monitor ==="
echo "Timestamp: $(date)"
echo

# System memory overview
echo "📊 System Memory:"
free -h | grep -E "Mem:|Swap:"
echo

# Container memory usage
echo "🐳 Container Memory Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" | head -6
echo

# Docker system usage
echo "💾 Docker System Usage:"
docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"
echo

# Memory warnings
TOTAL_MEM_PCT=$(free | grep Mem | awk '{printf "%.0f", ($3/$2) * 100.0}')
if [ "$TOTAL_MEM_PCT" -gt 85 ]; then
    echo "⚠️  WARNING: System memory usage is ${TOTAL_MEM_PCT}%"
    echo "   Consider running: docker system prune -f"
fi

# Check for memory pressure
if [ "$TOTAL_MEM_PCT" -gt 95 ]; then
    echo "🚨 CRITICAL: Memory pressure detected! Consider:"
    echo "   1. docker system prune -a -f"
    echo "   2. Restart high-memory containers"
    echo "   3. Clear system caches: sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'"
fi

echo "✅ Memory check complete"