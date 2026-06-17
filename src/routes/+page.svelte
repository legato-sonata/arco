<script lang="ts">
	import { tick, onMount } from 'svelte';

	let worker: Worker | null = null;
	const pendingJobs = new Map();
	let nextJobId = 0;

	onMount(async () => {
		const WorkerModule = await import('$lib/worker?worker');
		worker = new WorkerModule.default();
		worker.onmessage = (e) => {
			const { id, result, error } = e.data;
			if (pendingJobs.has(id)) {
				if (error) pendingJobs.get(id).reject(new Error(error));
				else pendingJobs.get(id).resolve(result);
				pendingJobs.delete(id);
			}
		};
	});

	function runWorkerJob(type: string, payload: any): Promise<any> {
		return new Promise((resolve, reject) => {
			if (!worker) return reject(new Error('Worker not initialized'));
			const id = nextJobId++;
			pendingJobs.set(id, { resolve, reject });
			worker.postMessage({ id, type, payload });
		});
	}

	let fileInput: HTMLInputElement;
	let viewerContainer: HTMLDivElement | undefined = $state();
	let clipViewport: HTMLDivElement | undefined = $state();
	let showOptions = $state(false);

	let isDragging = $state(false);
	let isConverting = $state(false);
	let isOptimizing = $state(false);

	let selectedFile: File | null = $state(null);
	let rasterDataUrl: string | null = $state(null);
	let rasterImgd: ImageData | null = null;
	let originalSize = $state(0);
	
	let originalSvg: string | null = $state(null);
	let svgSize = $state(0);
	
	let optimizedSvg: string | null = $state(null);
	let optimizedSize = $state(0);

	let ltres = $state(1);
	let qtres = $state(1);
	let pathomit = $state(8);

	let panX = $state(0);
	let panY = $state(0);
	let zoomLevel = $state(1);
	let isPanning = $state(false);
	let startX = $state(0);
	let startY = $state(0);

	let activePointers = $state(new Map<number, { x: number; y: number }>());
	let initialPinchDistance = $state<number | null>(null);
	let initialZoomLevel = $state(1);
	let isPinching = $state(false);
	
	// Pinch focal point state
	let initialPanX = $state(0);
	let initialPanY = $state(0);
	let initialMidX = $state(0);
	let initialMidY = $state(0);

	let splitPos = $state(50);
	let isDraggingSplit = $state(false);

	function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
		return Math.hypot(p2.x - p1.x, p2.y - p1.y);
	}

	function getMidpoint(p1: { x: number; y: number }, p2: { x: number; y: number }) {
		return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
	}

	function onPointerDown(e: PointerEvent) {
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		(e.target as Element)?.setPointerCapture(e.pointerId);

		if (activePointers.size === 1) {
			isPanning = true;
			isPinching = false;
			startX = e.clientX - panX;
			startY = e.clientY - panY;
		} else if (activePointers.size === 2) {
			isPanning = false;
			isPinching = true;
			const pts = Array.from(activePointers.values());
			initialPinchDistance = getDistance(pts[0], pts[1]);
			initialZoomLevel = zoomLevel;
			initialPanX = panX;
			initialPanY = panY;
			
			const mid = getMidpoint(pts[0], pts[1]);
			const rect = viewerContainer!.getBoundingClientRect();
			initialMidX = mid.x - rect.left;
			initialMidY = mid.y - rect.top;
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!activePointers.has(e.pointerId)) return;
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (isPinching && activePointers.size === 2 && initialPinchDistance) {
			const pts = Array.from(activePointers.values());
			const currentDist = getDistance(pts[0], pts[1]);
			const scaleDelta = currentDist / initialPinchDistance;
			const newZoom = Math.max(0.1, Math.min(5, initialZoomLevel * scaleDelta));
			
			const currentMid = getMidpoint(pts[0], pts[1]);
			const rect = viewerContainer!.getBoundingClientRect();
			const currentMidX = currentMid.x - rect.left;
			const currentMidY = currentMid.y - rect.top;
			
			const imageX = (initialMidX - initialPanX) / initialZoomLevel;
			const imageY = (initialMidY - initialPanY) / initialZoomLevel;
			
			panX = currentMidX - (imageX * newZoom);
			panY = currentMidY - (imageY * newZoom);
			zoomLevel = newZoom;
		} else if (isPanning && activePointers.size === 1) {
			panX = e.clientX - startX;
			panY = e.clientY - startY;
		}
	}

	function onPointerUp(e: PointerEvent) {
		activePointers.delete(e.pointerId);
		(e.target as Element)?.releasePointerCapture(e.pointerId);

		if (activePointers.size < 2) {
			isPinching = false;
			initialPinchDistance = null;
		}
		if (activePointers.size === 1) {
			isPanning = true;
			const pt = Array.from(activePointers.values())[0];
			startX = pt.x - panX;
			startY = pt.y - panY;
		} else if (activePointers.size === 0) {
			isPanning = false;
		}
	}

	function onPointerLeave(e: PointerEvent) {
		onPointerUp(e);
	}

	function onWheel(e: WheelEvent) {
		if (!originalSvg) return;
		e.preventDefault();
		const scaleDelta = e.deltaY > 0 ? 0.9 : 1.1;
		const newZoom = Math.max(0.1, Math.min(5, zoomLevel * scaleDelta));
		
		const rect = viewerContainer!.getBoundingClientRect();
		const currentMidX = e.clientX - rect.left;
		const currentMidY = e.clientY - rect.top;
		
		const imageX = (currentMidX - panX) / zoomLevel;
		const imageY = (currentMidY - panY) / zoomLevel;
		
		panX = currentMidX - (imageX * newZoom);
		panY = currentMidY - (imageY * newZoom);
		zoomLevel = newZoom;
	}

	function onPointerDownSplit(e: PointerEvent) {
		e.stopPropagation();
		isDraggingSplit = true;
		(e.target as Element)?.setPointerCapture(e.pointerId);
	}

	function onPointerMoveSplit(e: PointerEvent) {
		e.stopPropagation();
		if (!isDraggingSplit || !viewerContainer) return;
		const rect = viewerContainer.getBoundingClientRect();
		let newPos = ((e.clientX - rect.left) / rect.width) * 100;
		splitPos = Math.max(0, Math.min(100, newPos));
	}

	function onPointerUpSplit(e: PointerEvent) {
		e.stopPropagation();
		isDraggingSplit = false;
		(e.target as Element)?.releasePointerCapture(e.pointerId);
	}

	function fixSvgForZoom(svgStr: string) {
		let fixed = svgStr;
		const match = fixed.match(/<svg[^>]*width="([^"]+)"[^>]*height="([^"]+)"/);
		if (match && !fixed.includes('viewBox=')) {
			fixed = fixed.replace('<svg ', `<svg viewBox="0 0 ${match[1]} ${match[2]}" `);
		}
		fixed = fixed.replace(/(<svg[^>]*)width="[^"]+"/, '$1');
		fixed = fixed.replace(/(<svg[^>]*)height="[^"]+"/, '$1');
		fixed = fixed.replace('<svg ', '<svg width="100%" height="100%" style="display:block;max-width:100%;max-height:100%" ');
		return fixed;
	}

	function formatBytes(bytes: number) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			handleFile(e.dataTransfer.files[0]);
		}
	}

	function handleFileInput(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			handleFile(target.files[0]);
		}
	}

	function handleFile(file: File) {
		if (!file.type.startsWith('image/')) {
			alert('Please select an image file');
			return;
		}
		selectedFile = file;
		originalSize = file.size;
		originalSvg = null;
		optimizedSvg = null;
		showOptions = false;
		
		panX = 0; panY = 0; zoomLevel = 1;

		const reader = new FileReader();
		reader.onload = async (e) => {
			rasterDataUrl = e.target?.result as string;
			
			const img = new Image();
			img.onload = async () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.width;
				canvas.height = img.height;
				const ctx = canvas.getContext('2d');
				if (ctx) {
					ctx.drawImage(img, 0, 0);
					rasterImgd = ctx.getImageData(0, 0, canvas.width, canvas.height);
				}
				await tick();
				trace();
			};
			img.src = rasterDataUrl;
		};
		reader.readAsDataURL(file);
	}

	async function trace() {
		if (!rasterImgd || !worker) return;
		isConverting = true;
		optimizedSvg = null; // reset optimization if we re-trace

		try {
			const rawSvg = await runWorkerJob('trace', {
				imgd: rasterImgd,
				options: {
					ltres: ltres,
					qtres: qtres,
					pathomit: pathomit,
					colorsampling: 0,
					numberofcolors: 2,
					mincolorratio: 0,
					colorquantcycles: 1,
					scale: 1,
					simplifytolerance: 0,
					roundcoords: 1,
				}
			});

			if (rawSvg) {
				originalSvg = fixSvgForZoom(rawSvg as string);
				svgSize = new Blob([originalSvg]).size;
			}
		} catch (error) {
			console.error("Tracing error:", error);
			alert("An error occurred during tracing.");
		} finally {
			isConverting = false;
		}
	}

	async function optimizeSvg() {
		if (!originalSvg || !worker) return;
		isOptimizing = true;

		try {
			const optimizedRaw = await runWorkerJob('optimize', {
				originalSvg,
				options: {
					multipass: true,
					floatPrecision: 1,
					plugins: [
						{
							name: 'preset-default',
							params: {
								overrides: {
									cleanupNumericValues: { floatPrecision: 1 },
									convertPathData: { floatPrecision: 1, forceAbsolutePath: false, utilzeAbsolute: false },
									removeViewBox: false
								}
							}
						}
					]
				}
			});

			optimizedSvg = optimizedRaw as string;
			optimizedSize = new Blob([optimizedSvg]).size;
		} catch (error) {
			console.error("Optimization error:", error);
			alert("An error occurred during optimization.");
		} finally {
			isOptimizing = false;
		}
	}

	function downloadFile(content: string, filename: string) {
		const blob = new Blob([content], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
	
	function getDownloadFilename(type: 'raw' | 'optimized') {
		const base = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : 'arco';
		const now = new Date();
		const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
		return `${base}-${type}-${dateStr}.svg`;
	}

	function downloadActive() {
		if (optimizedSvg) downloadFile(optimizedSvg as string, getDownloadFilename('optimized'));
		else if (originalSvg) downloadFile(originalSvg as string, getDownloadFilename('raw'));
	}
</script>

<div class="h-[100dvh] w-full bg-gray-50 text-black font-sans selection:bg-gray-200 overflow-hidden flex flex-col">
	<input 
		type="file" 
		accept="image/png, image/jpeg" 
		class="hidden" 
		bind:this={fileInput}
		onchange={handleFileInput}
		aria-label="File upload"
	>

	{#if !rasterDataUrl}
		<!-- Upload Screen -->
		<div class="flex-1 flex flex-col items-center justify-center p-6 space-y-8 max-w-2xl mx-auto w-full">
			<header class="text-center space-y-3">
				<h1 class="text-5xl md:text-6xl font-bold tracking-tight text-black">Arco</h1>
				<p class="text-gray-500 text-lg md:text-xl">Convert raster line art to SVG, instantly.</p>
			</header>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div 
				role="button"
				tabindex="0"
				class="relative overflow-hidden w-full rounded-3xl transition-all duration-300 flex flex-col items-center justify-center p-10 md:p-16 text-center cursor-pointer border-2 {isDragging ? 'border-black bg-gray-100' : 'border-dashed border-gray-300 hover:border-gray-500 hover:bg-gray-100'}"
				ondragover={(e) => { e.preventDefault(); isDragging = true; }}
				ondragleave={() => { isDragging = false; }}
				ondrop={handleDrop}
				onclick={() => fileInput.click()}
			>
				<div class="space-y-4 pointer-events-none">
					<div class="w-16 h-16 mx-auto rounded-full bg-white shadow-sm flex items-center justify-center text-black border border-gray-100">
						<svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
						</svg>
					</div>
					<div>
						<p class="text-xl font-semibold text-black mb-1">Upload your sketch</p>
						<p class="text-gray-500">Drag & drop or tap to select</p>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Unified Workspace -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div 
			class="flex-1 relative w-full h-full bg-gray-100 overflow-hidden select-none" 
			style="touch-action: none;" 
			bind:this={viewerContainer}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onpointerleave={onPointerLeave}
			onwheel={onWheel}
		>
			
			<!-- Canvas Content -->
			{#if !originalSvg}
				<div class="absolute inset-0 flex items-center justify-center p-4">
					<img src={rasterDataUrl} alt="Original raster" class="max-w-full max-h-full object-contain opacity-50" />
				</div>
			{:else}
				<div class="absolute inset-0">
					<!-- Base Layer (Optimized) -->
					<div style="transform: translate({panX}px, {panY}px) scale({zoomLevel}); transform-origin: 0 0; {isPinching || isPanning ? '' : 'transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);'}" class="w-full h-full flex items-center justify-center p-4">
						<div class="w-full h-full flex items-center justify-center pointer-events-none">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html optimizedSvg || originalSvg}
						</div>
					</div>

					<!-- Clipped Layer (Raw) - Only show if optimized exists -->
					{#if optimizedSvg}
					<div class="absolute inset-0 pointer-events-none" style="clip-path: polygon(0 0, {splitPos}% 0, {splitPos}% 100%, 0 100%);" bind:this={clipViewport}>
						<div style="transform: translate({panX}px, {panY}px) scale({zoomLevel}); transform-origin: 0 0; {isPinching || isPanning ? '' : 'transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);'}" class="w-full h-full flex items-center justify-center p-4">
							<div class="w-full h-full flex items-center justify-center pointer-events-none">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html originalSvg}
							</div>
						</div>
					</div>

					<!-- Split Line -->
					<div class="absolute inset-y-0 w-1 bg-black z-10 shadow-[0_0_0_1px_rgba(255,255,255,0.2)] touch-none select-none hover:bg-gray-800" 
						style="left: {splitPos}%; transform: translateX(-50%); cursor: ew-resize;"
						onpointerdown={onPointerDownSplit}
						onpointermove={onPointerMoveSplit}
						onpointerup={onPointerUpSplit}
						onpointercancel={onPointerUpSplit}
					>
						<div class="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-10 h-10 bg-white border-2 border-black rounded-full flex items-center justify-center shadow-lg transition-transform {isDraggingSplit ? 'scale-95 bg-gray-50' : ''}">
							<svg class="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" transform="rotate(90 12 12)" />
							</svg>
						</div>
					</div>
					{/if}
				</div>
			{/if}

			<!-- Loading Overlay -->
			{#if isConverting || isOptimizing}
			<div class="fixed inset-0 bg-white/40 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none transition-opacity duration-300">
				<div class="bg-black text-white px-6 py-3 rounded-2xl flex items-center gap-3 shadow-2xl text-sm font-semibold">
					<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					{isConverting ? 'Tracing Vector...' : 'Optimizing Paths...'}
				</div>
			</div>
			{/if}

			<!-- Original Image Minimap (Top Right) -->
			<div class="absolute top-4 right-4 z-20 pointer-events-none flex flex-col items-end gap-2">
				<div class="w-24 h-24 md:w-32 md:h-32 bg-white/80 backdrop-blur rounded-2xl shadow-lg border border-white/50 p-2 relative overflow-hidden transition-all duration-500 hover:scale-105">
					<img src={rasterDataUrl} alt="Original" class="w-full h-full object-contain" />
					<div class="absolute bottom-1 right-1 bg-black/60 backdrop-blur-md text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm">
						Source
					</div>
				</div>
				<!-- Zoom Indicator -->
				<div class="bg-white/90 backdrop-blur border border-white/50 px-3 py-1.5 rounded-full shadow-sm text-xs font-bold text-gray-700">
					{Math.round(zoomLevel * 100)}%
				</div>
			</div>

			<!-- Status Badges (Top Left) -->
			<div class="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
				{#if originalSvg}
				<div class="bg-white/90 backdrop-blur text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full shadow-sm border border-white/50 text-gray-700 uppercase tracking-wider flex items-center gap-2">
					<span class="w-2 h-2 rounded-full bg-blue-500"></span>
					Raw SVG ({formatBytes(svgSize)})
				</div>
				{/if}
				{#if optimizedSvg}
				<div class="bg-white/90 backdrop-blur text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full shadow-sm border border-white/50 text-emerald-700 uppercase tracking-wider flex items-center gap-2">
					<span class="w-2 h-2 rounded-full bg-emerald-500"></span>
					Optimized ({formatBytes(optimizedSize)})
					<span class="text-emerald-500/70 ml-1">-{Math.round((1 - optimizedSize/svgSize)*100)}%</span>
				</div>
				{/if}
			</div>

			<!-- Options Popover -->
			{#if showOptions}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div 
				onpointerdown={(e) => e.stopPropagation()}
				onpointermove={(e) => e.stopPropagation()}
				class="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-white/95 backdrop-blur-2xl shadow-2xl rounded-3xl border border-white p-6 z-40 animate-in slide-in-from-bottom-4 fade-in duration-200"
			>
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-lg font-bold text-gray-900 tracking-tight">Trace Settings</h3>
					<button onclick={() => showOptions = false} class="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" aria-label="Close options">
						<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				
				<div class="space-y-6">
					<div class="space-y-3">
						<div class="flex justify-between items-center">
							<label for="ltres" class="text-sm font-semibold text-gray-700">Detail Level</label>
							<span class="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{ltres}</span>
						</div>
						<input id="ltres" type="range" min="0.1" max="5" step="0.1" bind:value={ltres} onchange={trace} class="w-full accent-black" />
					</div>
					
					<div class="space-y-3">
						<div class="flex justify-between items-center">
							<label for="qtres" class="text-sm font-semibold text-gray-700">Smoothness</label>
							<span class="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{qtres}</span>
						</div>
						<input id="qtres" type="range" min="0.1" max="5" step="0.1" bind:value={qtres} onchange={trace} class="w-full accent-black" />
					</div>

					<div class="space-y-3">
						<div class="flex justify-between items-center">
							<label for="pathomit" class="text-sm font-semibold text-gray-700">Noise Removal</label>
							<span class="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{pathomit}</span>
						</div>
						<input id="pathomit" type="range" min="0" max="64" step="1" bind:value={pathomit} onchange={trace} class="w-full accent-black" />
					</div>
				</div>
			</div>
			{/if}

			<!-- Floating Dock -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div 
				onpointerdown={(e) => e.stopPropagation()}
				onpointermove={(e) => e.stopPropagation()}
				class="fixed bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-8 fade-in duration-300"
			>
				<div class="bg-black/90 backdrop-blur-xl shadow-2xl border border-white/10 rounded-full px-1.5 py-1.5 flex items-center gap-0.5 sm:gap-2">
					
					<!-- New Image -->
					<button 
						onclick={() => fileInput.click()}
						class="flex flex-col items-center justify-center px-2 min-w-[48px] sm:min-w-[56px] h-12 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
					>
						<svg class="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
						</svg>
						<span class="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">New</span>
					</button>

					<div class="w-px h-6 bg-white/20"></div>

					<!-- Options Toggle -->
					<button 
						onclick={() => showOptions = !showOptions}
						class="flex flex-col items-center justify-center px-2 min-w-[48px] sm:min-w-[56px] h-12 rounded-full transition-colors {showOptions ? 'text-white bg-white/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}"
					>
						<svg class="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
						</svg>
						<span class="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">Settings</span>
					</button>

					{#if originalSvg}
					<div class="w-px h-6 bg-white/20"></div>

					<!-- Optimize -->
					<button 
						onclick={optimizeSvg}
						disabled={isOptimizing || optimizedSvg !== null}
						class="flex flex-col items-center justify-center px-2 min-w-[48px] sm:min-w-[56px] h-12 rounded-full transition-all disabled:opacity-50 {optimizedSvg ? 'text-emerald-400' : 'text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30'}"
					>
						{#if isOptimizing}
						<svg class="animate-spin w-4 h-4 mb-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						{:else}
						<svg class="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
						{/if}
						<span class="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">Optimize</span>
					</button>

					<div class="w-px h-6 bg-white/20"></div>

					<!-- Reset Zoom -->
					<button 
						onclick={() => { panX = 0; panY = 0; zoomLevel = 1; }}
						class="flex flex-col items-center justify-center px-2 min-w-[48px] sm:min-w-[56px] h-12 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
					>
						<svg class="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
						</svg>
						<span class="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">Reset</span>
					</button>
					
					<div class="w-px h-6 bg-white/20"></div>

					<!-- Download -->
					<button 
						onclick={downloadActive}
						class="flex flex-col items-center justify-center px-2 min-w-[48px] sm:min-w-[56px] h-12 rounded-full text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 transition-colors"
					>
						<svg class="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
						<span class="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">Download</span>
					</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
