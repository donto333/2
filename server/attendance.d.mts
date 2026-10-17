export interface AttendanceReward { day: number; label: string; general?: string; randomLegend?: boolean; freeRecruits?: number; freeDraws?: number; gold?: number; silver?: number; honor?: number; manuals?: number; resources?: number; fragments?: number; stones?: number }
export declare const ATTENDANCE_REWARDS: AttendanceReward[]
export declare const ATTENDANCE_DAYS: number
export declare function attendanceReward(day: number): AttendanceReward | null
export declare function attendanceLedger(day: number): { gold: number; fragments: number; stones: number }
export declare function nextAttendanceDay(record: { count?: number; last?: string } | null | undefined, today: string): number | null
