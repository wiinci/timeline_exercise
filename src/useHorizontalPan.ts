import {useEffect, useRef, useState} from 'react'

const DEFAULT_ACTIVATION_DISTANCE = 6

export function useHorizontalPan({
	scrollerRef,
	activationDistance = DEFAULT_ACTIVATION_DISTANCE,
	shouldIgnoreTarget,
}: {
	scrollerRef: React.RefObject<HTMLElement | null>
	activationDistance?: number
	shouldIgnoreTarget: (target: HTMLElement) => boolean
}) {
	const cleanupRef = useRef<(() => void) | null>(null)
	const [isPanning, setIsPanning] = useState(false)

	useEffect(() => {
		return () => {
			cleanupRef.current?.()
		}
	}, [])

	const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
		if (event.button !== 0 && event.pointerType !== 'touch') return

		const target = event.target as HTMLElement
		if (shouldIgnoreTarget(target)) return

		const scroller = scrollerRef.current
		if (!scroller) return

		const panSurface = event.currentTarget
		const startX = event.clientX
		const startY = event.clientY
		const startScrollLeft = scroller.scrollLeft
		let didActivate = false

		const cleanup = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointercancel', onUp)
			cleanupRef.current = null
			setIsPanning(false)
		}

		const onMove = (moveEvent: PointerEvent) => {
			const dx = moveEvent.clientX - startX
			const dy = moveEvent.clientY - startY

			if (!didActivate) {
				if (Math.hypot(dx, dy) < activationDistance) return
				didActivate = true
				setIsPanning(true)
				moveEvent.preventDefault()
				try {
					panSurface.setPointerCapture?.(event.pointerId)
				} catch {
					// Some browsers can throw here when pointer capture is unsupported.
				}
			}

			moveEvent.preventDefault()
			scroller.scrollLeft = startScrollLeft - dx
		}

		const onUp = () => {
			cleanup()
		}

		cleanupRef.current?.()
		cleanupRef.current = cleanup
		window.addEventListener('pointermove', onMove, {passive: false})
		window.addEventListener('pointerup', onUp)
		window.addEventListener('pointercancel', onUp)
	}

	return {isPanning, onPointerDown}
}
