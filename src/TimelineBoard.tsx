import type {UniqueIdentifier} from '@dnd-kit/core'
import {
	DndContext,
	type DragEndEvent,
	DragOverlay as DragOverlayBase,
	type DragStartEvent,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import {
	arrayMove,
	SortableContext as SortableContextBase,
	useSortable,
} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {
	addDays,
	differenceInCalendarDays,
	format,
	isAfter,
	isBefore,
	isValid,
} from 'date-fns'
import {ChevronLeft, Plus} from 'lucide-react'
import React, {useEffect, useMemo, useRef, useState} from 'react'

// dnd-kit JSX typing workaround for React 19
const SortableCtx = SortableContextBase as unknown as React.FC<any>
const DragOL = DragOverlayBase as unknown as React.FC<any>

export interface TimelineTask {
	id: UniqueIdentifier
	title: string
	start: Date | null
	end: Date | null
}

export interface TimelineViewport {
	start: Date
	end: Date
	pxPerDay?: number
}

export interface TimelineBoardProps {
	tasks: TimelineTask[]
	setTasks: React.Dispatch<React.SetStateAction<TimelineTask[]>>
	viewport: TimelineViewport
	onOrderChanged?: (orderedIds: string[], movedId?: string) => void
	onRowDoubleClick?: (taskId: string) => void
}

function clampDate(d: Date, start: Date, end: Date) {
	if (isBefore(d, start)) return start
	if (isAfter(d, end)) return end
	return d
}

/** Layout constants */
const ROW_HEIGHT = 40
const HEADER_HEIGHT = 52
const SIDEBAR_WIDTH = 256
const BAR_VERTICAL_PADDING = 6

function Row({
	task,
	onDoubleClick,
}: {
	task: TimelineTask
	onDoubleClick?: () => void
}) {
	const sortable = useSortable({
		id: task.id,
		data: {type: 'Row', task},
		attributes: {roleDescription: 'Row'},
	})
	const transform = CSS.Transform.toString(sortable.transform)
	const style: React.CSSProperties = {
		transform,
		transition: sortable.transition,
	}

	const handleDoubleClick = (e: React.MouseEvent) => {
		e.stopPropagation()
		onDoubleClick?.()
	}

	return (
		<div
			ref={sortable.setNodeRef}
			style={style}
			{...sortable.attributes}
			className="relative h-10"
			role="listitem"
		>
			<div
				{...sortable.listeners}
				onDoubleClick={handleDoubleClick}
				className="absolute inset-0 flex items-center px-2 cursor-pointer"
			>
				<span className="text-sm text-gray-800 truncate">
					{task.title || 'Untitled'}
				</span>
			</div>
		</div>
	)
}

function BarsLayer({
	tasks,
	viewport,
	onBarDoubleClick,
}: {
	tasks: TimelineTask[]
	viewport: TimelineViewport
	onBarDoubleClick?: (taskId: string, barLeftPx: number) => void
}) {
	const days = Math.max(
		1,
		differenceInCalendarDays(viewport.end, viewport.start) + 1,
	)
	const pxPerDay = viewport.pxPerDay ?? 16
	const totalPx = days * pxPerDay

	// Today marker position (clamped within viewport)
	const today = new Date()
	const clampedToday = clampDate(today, viewport.start, viewport.end)
	const isTodayInOuter =
		isValid(clampedToday as Date) &&
		!(isBefore(today, viewport.start) || isAfter(today, viewport.end))
	const todayIndex = Math.max(
		0,
		Math.min(days - 1, differenceInCalendarDays(clampedToday, viewport.start)),
	)
	const todayX = todayIndex * pxPerDay + Math.floor(pxPerDay / 2)

	return (
		<div
			className="relative"
			style={{
				width: totalPx,
				height: '100%',
				backgroundImage: `
          repeating-linear-gradient(90deg, #d1d5db 0px, #d1d5db 1px, transparent 1px, transparent ${7 * pxPerDay}px),
          repeating-linear-gradient(90deg, #f3f4f6 0px, #f3f4f6 1px, transparent 1px, transparent ${pxPerDay}px)
        `,
			}}
		>
			{/* today marker */}
			{isTodayInOuter && (
				<div
					className="absolute top-0 bottom-0 w-px bg-blue-600"
					style={{left: todayX, zIndex: 0}}
				/>
			)}

			{/* bars */}
			<div>
				{tasks.map((t, rowIndex) => {
					if (!t.start || !t.end || !isValid(t.start) || !isValid(t.end))
						return null
					if (isBefore(t.end, viewport.start) || isAfter(t.start, viewport.end))
						return null

					const start = clampDate(t.start, viewport.start, viewport.end)
					const end = clampDate(t.end, viewport.start, viewport.end)
					const startOffset =
						Math.max(0, differenceInCalendarDays(start, viewport.start)) *
						pxPerDay
					const daySpan = differenceInCalendarDays(end, start)
					const isSingleDay = daySpan === 0
					const width = Math.max(1, daySpan + 1) * pxPerDay

					// For single-day events, show as a point-in-time marker with diamond
					if (isSingleDay) {
						return (
							<div
								key={String(t.id)}
								className="absolute"
								style={{
									top: rowIndex * ROW_HEIGHT + BAR_VERTICAL_PADDING,
									left: startOffset,
								}}
							>
								<div
									className="max-w-96 pl-0.5 pr-1.5 py-0.5 bg-white rounded-md shadow-sm border border-gray-200 inline-flex justify-start items-center gap-1.5 overflow-hidden cursor-pointer"
									onDoubleClick={() =>
										onBarDoubleClick?.(String(t.id), startOffset)
									}
								>
									<div className="flex-1 pl-0.5 pr-1 py-0.5 rounded-md flex justify-start items-center gap-1.5">
										<div className="flex justify-start items-center gap-1">
											{/* Diamond marker to indicate point in time */}
											<div className="w-2 h-2 bg-gray-600 rotate-45 flex-shrink-0" />
											<span className="text-sm font-semibold text-gray-700">
												{format(t.start, 'MMM d')}
											</span>
											<span className="w-px h-3 bg-gray-300" />
											<div className="justify-start text-gray-800 text-sm leading-tight">
												{t.title || 'Untitled'}
											</div>
										</div>
									</div>
								</div>
							</div>
						)
					}

					return (
						<div
							key={String(t.id)}
							className="absolute"
							style={{
								top: rowIndex * ROW_HEIGHT + BAR_VERTICAL_PADDING,
								left: startOffset,
								width,
							}}
						>
							<div
								className="w-full pl-0.5 pr-1.5 py-0.5 bg-white rounded-md shadow-sm border border-gray-200 flex justify-start items-center gap-1.5 overflow-hidden cursor-pointer"
								onDoubleClick={() =>
									onBarDoubleClick?.(String(t.id), startOffset)
								}
							>
								<div className="flex-1 pl-0.5 pr-1 py-0.5 rounded-md flex justify-start items-center gap-1.5 min-w-0">
									<div className="text-gray-800 text-sm leading-tight truncate">
										{t.title || ''}
									</div>
								</div>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

const TimelineHeader = React.forwardRef<
	HTMLDivElement,
	{
		viewport: TimelineViewport
	}
>(({viewport}, ref) => {
	const pxPerDay = viewport.pxPerDay ?? 16
	const daysTotal = Math.max(
		1,
		differenceInCalendarDays(viewport.end, viewport.start) + 1,
	)

	// Months across full viewport
	const months: Array<{label: string; span: number}> = []
	let cursor = viewport.start
	while (!isAfter(cursor, viewport.end)) {
		const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
		const to = isAfter(monthEnd, viewport.end) ? viewport.end : monthEnd
		const span = Math.max(1, differenceInCalendarDays(to, cursor) + 1)
		months.push({label: format(cursor, 'LLLL yyyy'), span})
		cursor = addDays(to, 1)
	}

	// Today marker position
	const today = new Date()
	const clampedToday = clampDate(today, viewport.start, viewport.end)
	const isTodayInOuter =
		isValid(clampedToday as Date) &&
		!(isBefore(today, viewport.start) || isAfter(today, viewport.end))
	const todayIndex = Math.max(
		0,
		Math.min(
			daysTotal - 1,
			differenceInCalendarDays(clampedToday, viewport.start),
		),
	)
	const todayX = todayIndex * pxPerDay + Math.floor(pxPerDay / 2)

	return (
		<div
			ref={ref}
			className="sticky top-0 z-20 bg-white border-b border-gray-200 select-none"
		>
			{/* Months row */}
			<div className="h-7 flex items-center text-xs text-gray-700">
				<div className="w-64 shrink-0 px-2 flex items-center justify-between sticky left-0 bg-white z-30 border-r border-gray-200 h-full">
					<button
						aria-label="Add task"
						className="p-1 hover:bg-gray-100 rounded transition-colors"
					>
						<Plus
							size={16}
							className="text-gray-600"
						/>
					</button>
					<button
						aria-label="Collapse sidebar"
						className="p-1 hover:bg-gray-100 rounded transition-colors"
					>
						<ChevronLeft
							size={16}
							className="text-gray-600"
						/>
					</button>
				</div>
				<div className="relative">
					<div
						className="grid"
						style={{
							gridTemplateColumns: months
								.map(m => `${m.span * pxPerDay}px`)
								.join(' '),
						}}
					>
						{months.map((m, i) => (
							<div
								key={i}
								className="h-7 flex items-center border-l border-gray-200 px-2 font-medium text-left whitespace-nowrap overflow-hidden"
							>
								<span className="truncate">{m.label}</span>
							</div>
						))}
					</div>
					{isTodayInOuter && (
						<div
							className="absolute top-0 bottom-0 w-px bg-blue-600"
							style={{left: todayX}}
						/>
					)}
				</div>
			</div>
			{/* Days row */}
			<div className="h-6 flex items-center text-[11px] text-gray-500 border-t border-gray-100">
				<div className="w-64 shrink-0 px-2 sticky left-0 bg-white z-30 border-r border-gray-200 h-full" />
				<div
					className="relative"
					style={{width: daysTotal * pxPerDay}}
				>
					<div
						className="absolute inset-0 pointer-events-none"
						style={{
							backgroundImage: `
                repeating-linear-gradient(90deg, #f3f4f6 0px, #f3f4f6 1px, transparent 1px, transparent ${pxPerDay}px),
                repeating-linear-gradient(90deg, #e5e7eb 0px, #e5e7eb 1px, transparent 1px, transparent ${7 * pxPerDay}px)
              `,
						}}
					/>
					<div className="relative h-6">
						{Array.from({length: Math.ceil(daysTotal / 7)}).map(
							(_, weekIndex) => {
								const dayIndex = weekIndex * 7
								return (
									<div
										key={weekIndex}
										className="absolute top-0 h-6 flex items-center justify-center border-l border-transparent px-1"
										style={{left: dayIndex * pxPerDay, width: 7 * pxPerDay}}
									>
										<span className="truncate">
											{format(addDays(viewport.start, dayIndex), 'd')}
										</span>
									</div>
								)
							},
						)}
					</div>
					{isTodayInOuter && (
						<div
							className="absolute top-0 bottom-0 w-px bg-blue-600"
							style={{left: todayX}}
						/>
					)}
					{isTodayInOuter && (
						<>
							<div
								className="absolute -translate-x-1/2 -translate-y-1/2"
								style={{left: todayX, top: '50%'}}
								aria-label="Today"
							>
								<div className="px-2 h-5 rounded-lg bg-blue-600 text-white text-[11px] leading-5 font-medium shadow-sm inline-flex items-center justify-center">
									{format(clampedToday, 'd')}
								</div>
							</div>
							<div
								className="absolute -translate-x-1/2"
								style={{left: todayX}}
							>
								<div
									className="rounded-full bg-blue-600"
									style={{width: 6, height: 6}}
								/>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	)
})

export function TimelineBoard({
	tasks,
	setTasks,
	viewport,
	onOrderChanged,
	onRowDoubleClick,
}: TimelineBoardProps) {
	const sensors = useSensors(
		useSensor(MouseSensor, {activationConstraint: {distance: 5}}),
		useSensor(TouchSensor, {activationConstraint: {distance: 5}}),
		useSensor(KeyboardSensor),
	)
	const [activeRow, setActiveRow] = useState<TimelineTask | null>(null)

	// Measure viewport height to extend today marker fully even with few rows
	const scrollerRef = useRef<HTMLDivElement | null>(null)
	const [viewportH, setViewportH] = useState(0)
	useEffect(() => {
		const el = scrollerRef.current
		if (!el) return
		const update = () => setViewportH(el.clientHeight || 0)
		update()
		const ro = new ResizeObserver(update)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	const tasksIds = useMemo(() => tasks.map(t => t.id), [tasks])

	function onDragStart(e: DragStartEvent) {
		const data = e.active.data.current
		if (data?.type === 'Row') setActiveRow(data.task)
	}

	function onDragEnd(e: DragEndEvent) {
		setActiveRow(null)
		const {active, over} = e
		if (!over || !active) return
		const from = tasks.findIndex(t => t.id === active.id)
		const to = tasks.findIndex(t => t.id === over.id)
		if (from === -1 || to === -1 || from === to) return
		const next = arrayMove(tasks, from, to)
		setTasks(next)
		setTimeout(
			() =>
				onOrderChanged?.(
					next.map(t => String(t.id)),
					String(active.id),
				),
			0,
		)
	}

	// Derive viewport pixel width for bars layer and header
	const days = Math.max(
		1,
		differenceInCalendarDays(viewport.end, viewport.start) + 1,
	)
	const pxPerDay = viewport.pxPerDay ?? 16
	const totalPx = days * pxPerDay

	// Handler to scroll to a task's bar
	const scrollToTask = (taskId: string) => {
		const task = tasks.find(t => String(t.id) === taskId)
		if (!task) return
		const rowIndex = tasks.findIndex(t => String(t.id) === taskId)
		const scroller = scrollerRef.current
		if (!scroller) return

		const start =
			task.start && isValid(task.start)
				? clampDate(task.start, viewport.start, viewport.end)
				: null
		if (!start) return

		const startOffset =
			Math.max(0, differenceInCalendarDays(start, viewport.start)) * pxPerDay
		const targetScrollLeft =
			startOffset - (scroller.clientWidth - SIDEBAR_WIDTH) / 2
		const targetScrollTop =
			HEADER_HEIGHT +
			rowIndex * ROW_HEIGHT -
			scroller.clientHeight / 2 +
			ROW_HEIGHT / 2
		scroller.scrollTo({
			left: targetScrollLeft,
			top: targetScrollTop,
			behavior: 'smooth',
		})
	}

	return (
		<DndContext
			sensors={sensors}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			<div className="h-full flex flex-col">
				<div
					className="flex-1 overflow-auto relative"
					ref={scrollerRef}
				>
					<div
						style={{width: totalPx + SIDEBAR_WIDTH, minHeight: '100%'}}
						className="flex flex-col relative"
					>
						<TimelineHeader viewport={viewport} />
						<div className="flex-1 relative flex">
							{/* Left list - sticky to left */}
							<div
								className="sticky left-0 w-64 shrink-0 border-r border-gray-200 bg-white z-20"
								role="list"
								aria-label="Task list"
							>
								<SortableCtx items={tasksIds}>
									{tasks.map(t => (
										<Row
											key={String(t.id)}
											task={t}
											onDoubleClick={() => {
												scrollToTask(String(t.id))
												onRowDoubleClick?.(String(t.id))
											}}
										/>
									))}
								</SortableCtx>
							</div>

							{/* Right timeline grid */}
							<div
								className="relative cursor-grab flex-1"
								style={{
									width: totalPx,
									height: Math.max(tasks.length * ROW_HEIGHT, viewportH),
								}}
								role="grid"
								aria-label="Timeline grid"
								onPointerDown={e => {
									// Begin horizontal panning on left mouse or touch
									if (e.button !== 0 && e.pointerType !== 'touch') return
									const target = e.target as HTMLElement
									if (
										target.closest('button') ||
										target.closest('a') ||
										target.closest('input') ||
										target.closest('.cursor-pointer')
									) {
										return
									}
									const scroller = (scrollerRef.current as HTMLElement) || null
									if (!scroller) return
									e.preventDefault()
									try {
										;(
											e.currentTarget as unknown as Element
										).setPointerCapture?.(e.pointerId)
									} catch {}
									const startX = e.clientX
									const startScrollLeft = scroller.scrollLeft
									let panning = true
									// Update cursor
									const el = e.currentTarget as HTMLElement
									const prevCursor = el.style.cursor
									el.style.cursor = 'grabbing'
									const onMove = (ev: PointerEvent) => {
										if (!panning) return
										const dx = ev.clientX - startX
										scroller.scrollLeft = startScrollLeft - dx
									}
									const onUp = () => {
										panning = false
										el.style.cursor = prevCursor
										window.removeEventListener('pointermove', onMove)
										window.removeEventListener('pointerup', onUp)
										window.removeEventListener('pointercancel', onUp)
									}
									window.addEventListener('pointermove', onMove)
									window.addEventListener('pointerup', onUp)
									window.addEventListener('pointercancel', onUp)
								}}
							>
								<BarsLayer
									tasks={tasks}
									viewport={viewport}
									onBarDoubleClick={(taskId, barLeftPx) => {
										const scroller = scrollerRef.current
										if (!scroller) return
										const rowIndex = tasks.findIndex(
											t => String(t.id) === taskId,
										)
										if (rowIndex === -1) return
										// Center the bar in the viewport horizontally and vertically
										const targetScrollLeft =
											barLeftPx - (scroller.clientWidth - SIDEBAR_WIDTH) / 2
										const targetScrollTop =
											HEADER_HEIGHT +
											rowIndex * ROW_HEIGHT -
											scroller.clientHeight / 2 +
											ROW_HEIGHT / 2
										scroller.scrollTo({
											left: targetScrollLeft,
											top: targetScrollTop,
											behavior: 'smooth',
										})
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			{typeof document !== 'undefined' && (
				<DragOL>
					{activeRow && (
						<div className="pointer-events-none">
							<div className="h-10 flex items-center px-2 rounded bg-white shadow-sm border">
								<span className="text-sm">{activeRow.title}</span>
							</div>
						</div>
					)}
				</DragOL>
			)}
		</DndContext>
	)
}
