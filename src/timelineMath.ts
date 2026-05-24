import {differenceInCalendarDays, isAfter, isBefore, isValid} from 'date-fns'

import type {TimelineTask, TimelineViewport} from './TimelineBoard'

export const ROW_HEIGHT = 40
export const HEADER_MONTHS_HEIGHT = 28
export const HEADER_DAYS_HEIGHT = 24
export const HEADER_HEIGHT = HEADER_MONTHS_HEIGHT + HEADER_DAYS_HEIGHT
export const SIDEBAR_WIDTH = 256
export const BAR_VERTICAL_PADDING = 6

export function clampDate(d: Date, start: Date, end: Date) {
	if (isBefore(d, start)) return start
	if (isAfter(d, end)) return end
	return d
}

export function getViewportDays(viewport: TimelineViewport) {
	return Math.max(1, differenceInCalendarDays(viewport.end, viewport.start) + 1)
}

export function getTodayMarker(viewport: TimelineViewport, pxPerDay: number) {
	const today = new Date()
	const clampedToday = clampDate(today, viewport.start, viewport.end)
	const isTodayInView = !(
		isBefore(today, viewport.start) || isAfter(today, viewport.end)
	)
	const dayIndex = Math.max(
		0,
		Math.min(
			getViewportDays(viewport) - 1,
			differenceInCalendarDays(clampedToday, viewport.start),
		),
	)

	return {
		clampedToday,
		isTodayInView,
		todayX: dayIndex * pxPerDay + Math.floor(pxPerDay / 2),
	}
}

export function getTaskGeometry(
	task: TimelineTask,
	viewport: TimelineViewport,
	pxPerDay: number,
) {
	if (!task.start || !task.end || !isValid(task.start) || !isValid(task.end)) {
		return null
	}

	if (isAfter(task.start, task.end)) {
		return null
	}

	if (isBefore(task.end, viewport.start) || isAfter(task.start, viewport.end)) {
		return null
	}

	const start = clampDate(task.start, viewport.start, viewport.end)
	const end = clampDate(task.end, viewport.start, viewport.end)
	const left =
		Math.max(0, differenceInCalendarDays(start, viewport.start)) * pxPerDay
	const daySpan = differenceInCalendarDays(end, start)
	const width = Math.max(1, daySpan + 1) * pxPerDay

	return {
		start,
		end,
		left,
		width,
		centerX: left + width / 2,
		isSingleDay: daySpan === 0,
	}
}

export function getTaskScrollTarget({
	rowIndex,
	geometry,
	scrollerWidth,
	scrollerHeight,
}: {
	rowIndex: number
	geometry: NonNullable<ReturnType<typeof getTaskGeometry>>
	scrollerWidth: number
	scrollerHeight: number
}) {
	return {
		left: geometry.centerX - (scrollerWidth - SIDEBAR_WIDTH) / 2,
		top:
			HEADER_HEIGHT +
			rowIndex * ROW_HEIGHT -
			scrollerHeight / 2 +
			ROW_HEIGHT / 2,
	}
}
