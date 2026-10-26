import Foundation
import WorkNoteCore

/// 毎回同じ乱数（結果を固定するため）
struct SeededRandom: RandomNumberGenerator {
    var state: UInt64
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

var rng = SeededRandom(state: 20261026)
func ms(_ d: Date?) -> Any { d.map { Int(($0.timeIntervalSince1970 * 1000).rounded()) } ?? NSNull() }
func opt(_ v: Int?) -> Any { v ?? NSNull() }

let ruleSets: [[BreakRule]] = [
    BreakRule.defaults,
    [BreakRule(overMinutes: 0, breakMinutes: 60)],
    [BreakRule(overMinutes: 240, breakMinutes: 30), BreakRule(overMinutes: 480, breakMinutes: 75)],
    [],
]

// 勤怠の集計
var attendance: [[String: Any]] = []
for _ in 0..<3000 {
    let base = WorkCalendar.date(year: 2026, month: Int.random(in: 1...12, using: &rng), day: Int.random(in: 1...28, using: &rng), hour: 5)!
    let count = Int.random(in: 0...6, using: &rng)
    var t = base.addingTimeInterval(Double(Int.random(in: 0...600, using: &rng)) * 60)
    var punches: [PunchPoint] = []
    var nextIn = Bool.random(using: &rng) || count < 2
    for i in 0..<count {
        // ほとんどは交互、ときどき同じ種類が続く（打刻漏れ）
        let kind: PunchKind = (Int.random(in: 0..<10, using: &rng) == 0) ? (Bool.random(using: &rng) ? .clockIn : .clockOut) : (nextIn ? .clockIn : .clockOut)
        punches.append(PunchPoint(id: "p\(i)", kind: kind, time: t))
        nextIn = kind == .clockOut
        t = t.addingTimeInterval(Double(Int.random(in: 1...420, using: &rng)) * 60 + Double(Int.random(in: 0...59, using: &rng)))
    }
    punches.shuffle(using: &rng)
    let ruleIndex = Int.random(in: 0..<ruleSets.count, using: &rng)
    let override: Int? = Int.random(in: 0..<5, using: &rng) == 0 ? Int.random(in: 0...90, using: &rng) : nil
    let isPast = Bool.random(using: &rng)
    let s = AttendanceCalculator.summarize(punches: punches, rules: ruleSets[ruleIndex], breakOverride: override, isPastDay: isPast)
    let status: String = switch s.status {
    case .off: "off"
    case .working: "working"
    case .finished: "finished"
    case .missingPunch: "missingPunch"
    }
    attendance.append([
        "punches": punches.map { ["id": $0.id, "kind": $0.kind.rawValue, "time": ms($0.time)] },
        "rules": ruleSets[ruleIndex].map { ["overMinutes": $0.overMinutes, "breakMinutes": $0.breakMinutes] },
        "breakOverride": opt(override),
        "isPastDay": isPast,
        "expected": [
            "status": status,
            "sessions": s.sessions.map { [$0.clockIn.map { $0.id as Any } ?? NSNull(), $0.clockOut.map { $0.id as Any } ?? NSNull()] },
            "firstIn": ms(s.firstIn), "lastOut": ms(s.lastOut),
            "spanMinutes": opt(s.spanMinutes), "gapMinutes": opt(s.gapMinutes),
            "requiredBreakMinutes": opt(s.requiredBreakMinutes), "deductedBreakMinutes": opt(s.deductedBreakMinutes),
            "workMinutes": opt(s.workMinutes), "overtimeMinutes": opt(s.overtimeMinutes),
        ] as [String: Any],
    ])
}

// 締め日
var periods: [[String: Any]] = []
for closingDay in [0, 1, 5, 10, 15, 20, 25, 28, 29, 30, 31] {
    let p = ClosingPeriod(closingDay: closingDay)
    var monthKeys: [[String: Any]] = []
    for _ in 0..<200 {
        let date = Date(timeIntervalSince1970: Double(Int.random(in: 1_735_657_200...1_830_000_000, using: &rng)))
        monthKeys.append(["time": ms(date), "monthKey": p.monthKey(for: date), "dayKey": WorkCalendar.dayKey(date), "weekday": WorkCalendar.weekday(date)])
    }
    var ranges: [[String: Any]] = []
    for y in 2025...2028 {
        for m in 1...12 {
            let key = WorkCalendar.monthKey(year: y, month: m)
            let r = p.dateRange(monthKey: key)!
            ranges.append(["monthKey": key, "start": WorkCalendar.dayKey(r.start), "end": WorkCalendar.dayKey(r.end), "count": p.days(monthKey: key).count])
        }
    }
    periods.append(["closingDay": closingDay, "monthKeys": monthKeys, "ranges": ranges])
}

// 修正申請の期限
var deadlines: [[String: Any]] = []
let nationalHolidays = ["2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12", "2026-11-03", "2026-11-23", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]
for _ in 0..<500 {
    let holidays = Set(nationalHolidays.filter { _ in Int.random(in: 0..<4, using: &rng) != 0 })
    let closingDay = [0, 10, 15, 20, 25][Int.random(in: 0..<5, using: &rng)]
    let n = Int.random(in: 0...8, using: &rng)
    let key = WorkCalendar.monthKey(year: 2026, month: Int.random(in: 1...12, using: &rng))
    let b = BusinessDays(holidays: holidays)
    let p = ClosingPeriod(closingDay: closingDay)
    let d = b.correctionDeadline(monthKey: key, period: p, businessDays: n)!
    deadlines.append(["holidays": holidays.sorted(), "closingDay": closingDay, "businessDays": n, "monthKey": key, "deadline": WorkCalendar.dayKey(d)])
}

let out: [String: Any] = ["attendance": attendance, "periods": periods, "deadlines": deadlines]
let data = try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
let path = CommandLine.arguments.dropFirst().first ?? "golden.json"
try data.write(to: URL(fileURLWithPath: path))
print("\(path) に書き出しました（勤怠 \(attendance.count) 件、締め日 \(periods.count) 種類、期限 \(deadlines.count) 件）")
