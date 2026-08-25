"""
零讯内网穿透 并发压力测试脚本
测试目标：GET /api/health（无需鉴权，服务器毫秒级响应）

用法：D:/APP/python/python.exe test_concurrency.py
可选参数：
  --url       测试地址（默认使用健康检查接口）
  --start     起始并发数（默认 5）
  --max       最大并发数（默认 100）
  --step      每轮递增并发数（默认 5）
  --rounds    每个并发级别重复测试轮数（默认 3）
  --timeout   单次请求超时秒数（默认 10）
"""

import asyncio
import aiohttp
import time
import argparse
import statistics

API_BASE = "https://7b048004d78a4e86aa4c7f1eb2dfab31.hn.takin.cc"
HEALTH_PATH = "/api/health"


async def single_request(session, url, timeout_sec):
    """发送单次请求，返回 (是否成功, 响应时间ms)"""
    start = time.perf_counter()
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout_sec)) as resp:
            await resp.read()
            elapsed = (time.perf_counter() - start) * 1000
            return resp.status == 200, elapsed
    except Exception:
        elapsed = (time.perf_counter() - start) * 1000
        return False, elapsed


async def run_concurrent(session, url, concurrency, timeout_sec):
    """同时发起 concurrency 个请求"""
    tasks = [single_request(session, url, timeout_sec) for _ in range(concurrency)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    successes = 0
    failures = 0
    times = []
    for r in results:
        if isinstance(r, Exception):
            failures += 1
        else:
            ok, ms = r
            if ok:
                successes += 1
                times.append(ms)
            else:
                failures += 1
    return successes, failures, times


def print_result(concurrency, success, fail, times, round_num, total_rounds):
    """格式化输出一轮结果"""
    total = success + fail
    rate = (success / total * 100) if total > 0 else 0

    if times:
        avg_ms = statistics.mean(times)
        p50 = sorted(times)[len(times) // 2]
        min_ms = min(times)
        max_ms = max(times)
        time_str = f"avg={avg_ms:.0f}ms  p50={p50:.0f}ms  min={min_ms:.0f}ms  max={max_ms:.0f}ms"
    else:
        time_str = "无成功响应"

    status = "✅" if rate == 100 else ("⚠️" if rate > 0 else "❌")
    print(f"  {status} 并发={concurrency:>3}  成功={success:>3}/{total:<3}  "
          f"成功率={rate:>5.1f}%  {time_str}  (轮次 {round_num}/{total_rounds})")


async def main():
    parser = argparse.ArgumentParser(description="零讯内网穿透并发压力测试")
    parser.add_argument("--url", default=f"{API_BASE}{HEALTH_PATH}", help="测试URL")
    parser.add_argument("--start", type=int, default=5, help="起始并发数")
    parser.add_argument("--max", type=int, default=100, help="最大并发数")
    parser.add_argument("--step", type=int, default=5, help="每轮递增")
    parser.add_argument("--rounds", type=int, default=3, help="每级重复轮数")
    parser.add_argument("--timeout", type=int, default=10, help="单请求超时(秒)")
    args = parser.parse_args()

    print("=" * 70)
    print("  零讯内网穿透 · 并发压力测试")
    print("=" * 70)
    print(f"  目标地址：{args.url}")
    print(f"  并发范围：{args.start} → {args.max}（步长 {args.step}）")
    print(f"  每级轮数：{args.rounds}    单请求超时：{args.timeout}s")
    print("=" * 70)

    # 先做一次单请求确认连通性
    print("\n🔗 连通性预检...")
    connector = aiohttp.TCPConnector(limit=0)
    async with aiohttp.ClientSession(connector=connector) as session:
        ok, ms = await single_request(session, args.url, args.timeout)
        if ok:
            print(f"  ✅ 服务器可达，单次响应 {ms:.0f}ms\n")
        else:
            print(f"  ❌ 服务器不可达（{ms:.0f}ms），请检查地址后重试\n")
            return

    # 开始压力测试
    print("-" * 70)
    print("  开始压力测试（逐步递增并发）")
    print("-" * 70)

    first_fail_concurrency = None
    all_fail_concurrency = None
    summary = []

    for concurrency in range(args.start, args.max + 1, args.step):
        round_successes = []
        round_failures = []
        round_times = []

        connector = aiohttp.TCPConnector(limit=0, force_close=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            for r in range(1, args.rounds + 1):
                s, f, t = await run_concurrent(session, args.url, concurrency, args.timeout)
                print_result(concurrency, s, f, t, r, args.rounds)
                round_successes.append(s)
                round_failures.append(f)
                round_times.extend(t)
                # 轮次间隔，避免叠加效应
                await asyncio.sleep(0.5)

        avg_success = statistics.mean(round_successes)
        rate = avg_success / concurrency * 100

        summary.append({
            "concurrency": concurrency,
            "avg_success": avg_success,
            "rate": rate,
            "avg_time": statistics.mean(round_times) if round_times else 0,
        })

        if rate < 100 and first_fail_concurrency is None:
            first_fail_concurrency = concurrency
        if rate == 0 and all_fail_concurrency is None:
            all_fail_concurrency = concurrency
            break  # 全部失败就不用继续测了

        # 轮组间隔
        await asyncio.sleep(1)

    # 打印汇总
    print("\n" + "=" * 70)
    print("  📊 测试汇总")
    print("=" * 70)
    print(f"  {'并发数':>6}  {'成功率':>8}  {'平均响应':>10}  {'状态':>6}")
    print(f"  {'------':>6}  {'------':>8}  {'--------':>10}  {'----':>6}")
    for row in summary:
        status = "✅" if row["rate"] == 100 else ("⚠️" if row["rate"] > 0 else "❌")
        print(f"  {row['concurrency']:>6}  {row['rate']:>7.1f}%  {row['avg_time']:>8.0f}ms  {status:>6}")

    print("\n  结论：")
    if first_fail_concurrency:
        print(f"  • 首次出现失败的并发数：{first_fail_concurrency}")
        print(f"  • 建议安全并发上限：{first_fail_concurrency - args.step}")
    else:
        print(f"  • 在 {args.max} 并发内全部成功，隧道承载能力 ≥ {args.max}")
    if all_fail_concurrency:
        print(f"  • 全部失败的并发数：{all_fail_concurrency}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
