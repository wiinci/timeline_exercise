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
import {addDays, differenceInCalendarDays, format, isAfter} from 'date-fns'
import {ChevronLeft, Plus} from 'lucide-react'
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
	BAR_VERTICAL_PADDING,
	HEADER_DAYS_HEIGHT,
	HEADER_MONTHS_HEIGHT,
	HEADER_HEIGHT,
	ROW_HEIGHT,
	SIDEBAR_WIDTH,
	getTaskGeometry,
	getTaskScrollTarget,
	getTodayMarker,
	getViewportDays,
} from './timelineMath'
import {useHorizontalPan} from './useHorizontalPan'

// dnd-kit JSX typing workaround for React 19
type SortableCtxProps = React.ComponentProps<typeof SortableContextBase>
type DragOverlayProps = React.ComponentProps<typeof DragOverlayBase>
const SortableCtx =
	SortableContextBase as unknown as React.ComponentType<SortableCtxProps>
const DragOL =
	DragOverlayBase as unknown as React.ComponentType<DragOverlayProps>

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

interface RowProps {
	task: TimelineTask
	onActivateTask?: (taskId: string) => void
}

const Row = React.memo(function Row({task, onActivateTask}: RowProps) {
	const sortable = useSortable({
		id: task.id,
		data: {type: 'Row', task},
	})
	const transform = CSS.Transform.toString(sortable.transform)
	const style: React.CSSProperties = {
		transform,
		transition: sortable.transition,
	}

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation()
		onActivateTask?.(String(task.id))
	}

	return (
		<li
			ref={sortable.setNodeRef}
			style={style}
			className="relative list-none"
		>
			<button
				type="button"
				{...sortable.attributes}
				{...sortable.listeners}
				onClick={handleClick}
				style={{lineHeight: `${ROW_HEIGHT}px`}}
				className="w-full px-2 text-left"
			>
				<span className="text-sm text-gray-800 truncate">
					{task.title || 'Untitled'}
				</span>
			</button>
		</li>
	)
})

Row.displayName = 'Row'

function getTaskButtonLabel(task: TimelineTask, start: Date, end: Date) {
	const title = task.title || 'Untitled'
	if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
		return `${title}, ${format(start, 'MMMM d, yyyy')}`
	}

	return `${title}, ${format(start, 'MMMM d, yyyy')} to ${format(end, 'MMMM d, yyyy')}`
}

function BarsLayer({
	tasks,
	viewport,
	onBarActivate,
}: {
	tasks: TimelineTask[]
	viewport: TimelineViewport
	onBarActivate?: (taskId: string) => void
}) {
	const days = getViewportDays(viewport)
	const pxPerDay = viewport.pxPerDay ?? 16
	const totalPx = days * pxPerDay
	const {isTodayInView, todayX} = getTodayMarker(viewport, pxPerDay)

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
			{isTodayInView && (
				<div
					className="absolute top-0 bottom-0 w-px bg-blue-600"
					style={{left: todayX, zIndex: 0}}
				/>
			)}

			{/* bars */}
			<div>
				{tasks.map((t, rowIndex) => {
					const geometry = getTaskGeometry(t, viewport, pxPerDay)
					if (!geometry) return null
					const buttonLabel = getTaskButtonLabel(
						t,
						geometry.start,
						geometry.end,
					)

					// For single-day events, show as a point-in-time marker with diamond
					if (geometry.isSingleDay) {
						return (
							<div
								key={String(t.id)}
								className="absolute"
								style={{
									top: rowIndex * ROW_HEIGHT + BAR_VERTICAL_PADDING,
									left: geometry.left,
								}}
							>
								<button
									type="button"
									aria-label={buttonLabel}
									className="max-w-96 pl-0.5 pr-1.5 py-0.5 bg-white rounded-md shadow-sm border border-gray-200 inline-flex justify-start items-center gap-1.5 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
									onClick={() => onBarActivate?.(String(t.id))}
								>
									<span className="flex-1 pl-0.5 pr-1 py-0.5 rounded-md inline-flex justify-start items-center gap-1.5">
										<span className="inline-flex justify-start items-center gap-1 min-w-0">
											<span
												className="w-2 h-2 bg-gray-600 rotate-45 shrink-0"
												aria-hidden="true"
											/>
											<span className="text-sm font-semibold text-gray-700">
												{format(geometry.start, 'MMM d')}
											</span>
											<span
												className="w-px h-3 bg-gray-300 shrink-0"
												aria-hidden="true"
											/>
											<span className="text-gray-800 text-sm leading-tight truncate">
												{t.title || 'Untitled'}
											</span>
										</span>
									</span>
								</button>
							</div>
						)
					}

					return (
						<div
							key={String(t.id)}
							className="absolute"
							style={{
								top: rowIndex * ROW_HEIGHT + BAR_VERTICAL_PADDING,
								left: geometry.left,
								width: geometry.width,
							}}
						>
							<button
								type="button"
								aria-label={buttonLabel}
								className="w-full pl-0.5 pr-1.5 py-0.5 bg-white rounded-md shadow-sm border border-gray-200 flex justify-start items-center gap-1.5 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
								onClick={() => onBarActivate?.(String(t.id))}
							>
								<span className="flex-1 pl-0.5 pr-1 py-0.5 rounded-md inline-flex justify-start items-center gap-1.5 min-w-0">
									<span className="text-gray-800 text-sm leading-tight truncate">
										{t.title || 'Untitled'}
									</span>
								</span>
							</button>
						</div>
					)
				})}
			</div>
		</div>
	)
}

function TimelineSidebarHeader() {
	return (
		<div
			className="shrink-0 sticky left-0 bg-white z-30 border-r border-gray-200"
			style={{width: SIDEBAR_WIDTH, height: HEADER_HEIGHT}}
		>
			<div
				className="px-2 flex items-center justify-between"
				style={{height: HEADER_MONTHS_HEIGHT}}
			>
				<button
					type="button"
					disabled
					className="p-1 rounded text-gray-400 cursor-not-allowed disabled:opacity-100"
				>
					<Plus
						size={16}
						className="text-gray-600"
						aria-hidden="true"
					/>
					<span className="sr-only">Add task</span>
				</button>
				<button
					type="button"
					disabled
					className="p-1 rounded text-gray-400 cursor-not-allowed disabled:opacity-100"
				>
					<ChevronLeft
						size={16}
						className="text-gray-600"
						aria-hidden="true"
					/>
					<span className="sr-only">Collapse sidebar</span>
				</button>
			</div>
			<div
				className="border-t border-gray-100"
				style={{height: HEADER_DAYS_HEIGHT}}
			/>
		</div>
	)
}

function TimelineHeaderTimeline({viewport}: {viewport: TimelineViewport}) {
	const pxPerDay = viewport.pxPerDay ?? 16
	const daysTotal = getViewportDays(viewport)

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

	const {clampedToday, isTodayInView, todayX} = getTodayMarker(
		viewport,
		pxPerDay,
	)

	return (
		<div
			className="bg-white select-none"
			style={{width: daysTotal * pxPerDay}}
		>
			<div
				className="flex items-center text-xs text-gray-700"
				style={{height: HEADER_MONTHS_HEIGHT}}
			>
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
								className="flex items-center border-l border-gray-200 px-2 font-medium text-left whitespace-nowrap overflow-hidden"
								style={{height: HEADER_MONTHS_HEIGHT}}
							>
								<span className="truncate">{m.label}</span>
							</div>
						))}
					</div>
					{isTodayInView && (
						<div
							className="absolute top-0 bottom-0 w-px bg-blue-600"
							style={{left: todayX}}
						/>
					)}
				</div>
			</div>
			<div
				className="flex items-center text-[11px] text-gray-500 border-t border-gray-100"
				style={{height: HEADER_DAYS_HEIGHT}}
			>
				<div
					className="relative"
					style={{width: daysTotal * pxPerDay, height: HEADER_DAYS_HEIGHT}}
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
					<div
						className="relative"
						style={{height: HEADER_DAYS_HEIGHT}}
					>
						{Array.from({length: Math.ceil(daysTotal / 7)}).map(
							(_, weekIndex) => {
								const dayIndex = weekIndex * 7
								const weekSpan = Math.min(7, daysTotal - dayIndex)
								return (
									<div
										key={weekIndex}
										className="absolute top-0 flex items-center justify-center border-l border-transparent px-1"
										style={{
											left: dayIndex * pxPerDay,
											width: weekSpan * pxPerDay,
											height: HEADER_DAYS_HEIGHT,
										}}
									>
										<span className="truncate">
											{format(addDays(viewport.start, dayIndex), 'd')}
										</span>
									</div>
								)
							},
						)}
					</div>
					{isTodayInView && (
						<div
							className="absolute top-0 bottom-0 w-px bg-blue-600"
							style={{left: todayX}}
						/>
					)}
					{isTodayInView && (
						<>
							<div
								className="absolute -translate-x-1/2 -translate-y-1/2"
								style={{left: todayX, top: '50%'}}
							>
								<time
									dateTime={format(clampedToday, 'yyyy-MM-dd')}
									className="px-2 h-5 rounded-lg bg-blue-600 text-white text-[11px] leading-5 font-medium shadow-sm inline-flex items-center justify-center"
								>
									<span aria-hidden="true">{format(clampedToday, 'd')}</span>
									<span className="sr-only">
										Today, {format(clampedToday, 'MMMM d, yyyy')}
									</span>
								</time>
							</div>
							<div
								className="absolute -translate-x-1/2"
								style={{left: todayX}}
								aria-hidden="true"
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
}

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
	const verticalScrollerRef = useRef<HTMLDivElement | null>(null)
	const horizontalScrollerRef = useRef<HTMLDivElement | null>(null)
	const headerTimelineRef = useRef<HTMLDivElement | null>(null)
	const [bodyViewportH, setBodyViewportH] = useState(0)
	useEffect(() => {
		const el = verticalScrollerRef.current
		if (!el) return
		const update = () =>
			setBodyViewportH(Math.max(0, (el.clientHeight || 0) - HEADER_HEIGHT))
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
		onOrderChanged?.(
			next.map(t => String(t.id)),
			String(active.id),
		)
	}

	// Derive viewport pixel width for bars layer and header
	const days = getViewportDays(viewport)
	const pxPerDay = viewport.pxPerDay ?? 16
	const totalPx = days * pxPerDay
	const {isPanning, onPointerDown} = useHorizontalPan({
		scrollerRef: horizontalScrollerRef,
		shouldIgnoreTarget: target =>
			Boolean(
				target.closest('button') ||
				target.closest('a') ||
				target.closest('input') ||
				target.closest('select') ||
				target.closest('textarea') ||
				target.closest('[contenteditable="true"]'),
			),
	})

	const scrollToTask = useCallback(
		(taskId: string) => {
			const task = tasks.find(t => String(t.id) === taskId)
			if (!task) return
			const rowIndex = tasks.findIndex(t => String(t.id) === taskId)
			const verticalScroller = verticalScrollerRef.current
			const horizontalScroller = horizontalScrollerRef.current
			if (!verticalScroller || !horizontalScroller) return

			const geometry = getTaskGeometry(task, viewport, pxPerDay)
			if (!geometry || rowIndex === -1) return

			const target = getTaskScrollTarget({
				rowIndex,
				geometry,
				scrollerWidth: horizontalScroller.clientWidth,
				scrollerHeight: verticalScroller.clientHeight,
			})
			horizontalScroller.scrollTo({
				left: geometry.centerX - horizontalScroller.clientWidth / 2,
				behavior: 'smooth',
			})
			verticalScroller.scrollTo({
				top: target.top,
				behavior: 'smooth',
			})
		},
		[tasks, viewport, pxPerDay],
	)

	const handleActivateTask = useCallback(
		(taskId: string) => {
			scrollToTask(taskId)
			onRowDoubleClick?.(taskId)
		},
		[onRowDoubleClick, scrollToTask],
	)

	return (
		<DndContext
			sensors={sensors}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			<div className="h-full flex flex-col">
				<div
					className="flex-1 overflow-y-auto overflow-x-hidden relative"
					ref={verticalScrollerRef}
				>
					<div className="flex flex-col relative min-h-full">
						<div className="sticky top-0 z-20 bg-white border-b border-gray-200">
							<div className="flex">
								<TimelineSidebarHeader />
								<div
									ref={headerTimelineRef}
									className="flex-1 overflow-hidden"
								>
									<TimelineHeaderTimeline viewport={viewport} />
								</div>
							</div>
						</div>
						<div className="flex flex-1">
							{/* Left list - sticky to left */}
							<ul
								className="shrink-0 border-r border-gray-200 bg-white z-20 m-0 p-0"
								style={{width: SIDEBAR_WIDTH}}
							>
								<SortableCtx items={tasksIds}>
									{tasks.map(t => (
										<Row
											key={String(t.id)}
											task={t}
											onActivateTask={handleActivateTask}
										/>
									))}
								</SortableCtx>
							</ul>

							<div
								ref={horizontalScrollerRef}
								className={`relative flex-1 overflow-x-auto overflow-y-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
								style={{touchAction: 'pan-y'}}
								onPointerDown={onPointerDown}
								onScroll={event => {
									if (!headerTimelineRef.current) return
									headerTimelineRef.current.scrollLeft =
										event.currentTarget.scrollLeft
								}}
							>
								<div
									className="relative"
									style={{
										width: totalPx,
										height: Math.max(tasks.length * ROW_HEIGHT, bodyViewportH),
									}}
								>
									<BarsLayer
										tasks={tasks}
										viewport={viewport}
										onBarActivate={scrollToTask}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{typeof document !== 'undefined' && (
				<DragOL>
					{activeRow && (
						<div
							className="pointer-events-none"
							aria-hidden="true"
						>
							<div
								className="flex items-center px-2 rounded bg-white shadow-sm border"
								style={{height: ROW_HEIGHT}}
							>
								<span className="text-sm">{activeRow.title}</span>
							</div>
						</div>
					)}
				</DragOL>
			)}
		</DndContext>
	)
}
