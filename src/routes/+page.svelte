<script lang="ts">
	import { optimize } from 'svgo/browser';
	import ImageTracer from 'imagetracerjs';

	let fileInput: HTMLInputElement;
	let isDragging = $state(false);
	let isConverting = $state(false);
	let isOptimizing = $state(false);

	let selectedFile: File | null = $state(null);
	let rasterDataUrl: string | null = $state(null);
	
	let originalSvg: string | null = $state(null);
	let optimizedSvg: string | null = $state(null);

	let originalSize = $state(0);
	let svgSize = $state(0);
	let optimizedSize = $state(0);

	// ImageTracer options
	let ltres = $state(1);
	let qtres = $state(1);
	let pathomit = $state(8);

	// Unified Viewer State
	let zoomLevel = $state(1);
	let splitPos = $state(50);
	
	let scrollX = $state(0);
	let scrollY = $state(0);

	let isDraggingSplit = $state(false);
	let viewerContainer: HTMLDivElement | undefined = $state();
	let clipViewport: HTMLDivElement | undefined = $state();

	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let initialPanX = 0;
	let initialPanY = 0;
	let pinchMidpoint = { x: 0, y: 0 };
	let lastPanPosition = { x: 0, y: 0 };

	let activePointers = new Map<number, {x: number, y: number}>();
	let isPinching = $state(false);
	let initialPinchDistance = 0;
	let initialZoomLevel = 1;

	function handleZoom(amount: number) {
		const newZoom = Math.max(0.1, Math.min(10, zoomLevel + amount));
		if (viewerContainer) {
			const rect = viewerContainer.getBoundingClientRect();
			const midX = rect.width / 2;
			const midY = rect.height / 2;
			panX = midX - (midX - panX) * (newZoom / zoomLevel);
			panY = midY - (midY - panY) * (newZoom / zoomLevel);
		}
		zoomLevel = newZoom;
	}

	function onPointerDown(e: PointerEvent) {
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		
		if (activePointers.size === 1) {
			isPanning = true;
			lastPanPosition = { x: e.clientX, y: e.clientY };
		} else if (activePointers.size === 2) {
			isPanning = false;
			isPinching = true;
			const pointers = Array.from(activePointers.values());
			initialPinchDistance = Math.hypot(
				pointers[0].x - pointers[1].x,
				pointers[0].y - pointers[1].y
			);
			initialZoomLevel = zoomLevel;
			initialPanX = panX;
			initialPanY = panY;

			const rect = viewerContainer?.getBoundingClientRect();
			const offsetX = rect ? rect.left : 0;
			const offsetY = rect ? rect.top : 0;

			pinchMidpoint = {
				x: ((pointers[0].x + pointers[1].x) / 2) - offsetX,
				y: ((pointers[0].y + pointers[1].y) / 2) - offsetY
			};
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!activePointers.has(e.pointerId)) return;
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		
		if (activePointers.size === 1 && isPanning) {
			const dx = e.clientX - lastPanPosition.x;
			const dy = e.clientY - lastPanPosition.y;
			panX += dx;
			panY += dy;
			lastPanPosition = { x: e.clientX, y: e.clientY };
		} else if (activePointers.size === 2 && isPinching) {
			const pointers = Array.from(activePointers.values());
			const currentDistance = Math.hypot(
				pointers[0].x - pointers[1].x,
				pointers[0].y - pointers[1].y
			);
			
			if (initialPinchDistance > 0) {
				const scaleRatio = currentDistance / initialPinchDistance;
				const newZoom = Math.max(0.1, Math.min(10, initialZoomLevel * scaleRatio));
				
				panX = pinchMidpoint.x - (pinchMidpoint.x - initialPanX) * (newZoom / initialZoomLevel);
				panY = pinchMidpoint.y - (pinchMidpoint.y - initialPanY) * (newZoom / initialZoomLevel);
				
				zoomLevel = newZoom;
			}
		}
	}

	function onPointerUp(e: PointerEvent) {
		activePointers.delete(e.pointerId);
		if (activePointers.size < 2) {
			isPinching = false;
			initialPinchDistance = 0;
		}
		if (activePointers.size === 1) {
			const remainingPointer = Array.from(activePointers.values())[0];
			isPanning = true;
			lastPanPosition = { x: remainingPointer.x, y: remainingPointer.y };
		} else if (activePointers.size === 0) {
			isPanning = false;
		}
	}

	function onPointerLeave(e: PointerEvent) {
		onPointerUp(e);
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

	function handleBaseScroll(e: Event) {
		if (!clipViewport) return;
		const target = e.target as HTMLDivElement;
		clipViewport.scrollTop = target.scrollTop;
		clipViewport.scrollLeft = target.scrollLeft;
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
		
		panX = 0;
		panY = 0;
		zoomLevel = 1;

		const reader = new FileReader();
		reader.onload = (e) => {
			rasterDataUrl = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function trace() {
		if (!rasterDataUrl) return;
		isConverting = true;
		optimizedSvg = null; // reset optimization if we re-trace
		zoomLevel = 1;
		splitPos = 50;

		await new Promise(r => setTimeout(r, 50));

		try {
			let rawSvg = await new Promise<string>((resolve) => {
				ImageTracer.imageToSVG(
					rasterDataUrl,
					(svgstr: string) => resolve(svgstr),
					{
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
				);
			});

			if (rawSvg) {
				originalSvg = fixSvgForZoom(rawSvg);
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
		if (!originalSvg) return;
		isOptimizing = true;

		await new Promise(r => setTimeout(r, 50));

		try {
			const result = optimize(originalSvg, {
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
			});

			optimizedSvg = fixSvgForZoom(result.data);
			optimizedSize = new Blob([optimizedSvg]).size;
		} catch (error) {
			console.error("Optimization error:", error);
			alert("An error occurred during optimization.");
		} finally {
			isOptimizing = false;
		}
	}

	function download(content: string, filename: string) {
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
</script>

<div class="min-h-screen bg-white text-black font-sans selection:bg-gray-200">
	<div class="max-w-4xl mx-auto px-4 py-8 md:py-16 space-y-12">
		<!-- Header -->
		<header class="text-center space-y-3">
			<h1 class="text-4xl md:text-5xl font-bold tracking-tight text-black">Arco</h1>
			<p class="text-gray-500 text-base md:text-lg max-w-xl mx-auto">
				Convert raster line art to SVG, then optimize.
			</p>
		</header>

		<main class="space-y-12">
			
			<!-- Upload Zone -->
			<section aria-label="Upload Image">
				<div 
					role="button"
					tabindex="0"
					class="relative overflow-hidden rounded-2xl transition-all duration-300 flex flex-col items-center justify-center p-8 md:p-12 text-center cursor-pointer min-h-[200px] border-2 {isDragging ? 'border-black bg-gray-50' : 'border-dashed border-gray-300 hover:border-gray-500 hover:bg-gray-50'}"
					ondragover={(e) => { e.preventDefault(); isDragging = true; }}
					ondragleave={() => { isDragging = false; }}
					ondrop={handleDrop}
					onclick={() => fileInput.click()}
					onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
				>
					<input 
						type="file" 
						accept="image/png, image/jpeg" 
						class="hidden" 
						bind:this={fileInput}
						onchange={handleFileInput}
						aria-label="File upload"
					>
					<div class="space-y-3 pointer-events-none">
						<div class="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-black">
							<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
							</svg>
						</div>
						<div>
							<p class="font-medium text-black">Tap to upload or drag and drop</p>
							<p class="text-sm text-gray-500 mt-1">PNG or JPG (Line art)</p>
						</div>
					</div>
				</div>
			</section>

			{#if rasterDataUrl}
			<!-- Source Preview and Options -->
			<section class="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500" aria-label="Tracing options and preview">
				<div class="space-y-6">
					<div>
						<h2 class="text-lg font-semibold border-b border-gray-100 pb-2 mb-4">Original Image</h2>
						<div class="bg-gray-50 rounded-xl p-4 flex items-center justify-center min-h-[200px] border border-gray-100">
							<img src={rasterDataUrl} alt="Source Preview" class="max-w-full max-h-[300px] object-contain shadow-sm" />
						</div>
						<div class="text-sm text-gray-500 mt-2 text-right">Size: {formatBytes(originalSize)}</div>
					</div>
				</div>

				<div class="space-y-6">
					<h2 class="text-lg font-semibold border-b border-gray-100 pb-2">Tracing Options</h2>
					
					<div class="space-y-6">
						<div class="space-y-2">
							<div class="flex justify-between items-end">
								<div>
									<label for="ltres" class="text-gray-900 font-medium block">Detail Level</label>
									<span class="text-xs text-gray-500 block max-w-[200px]">Lower = captures tiny details, Higher = ignores small squiggles</span>
								</div>
								<span class="text-gray-700 font-mono text-sm bg-gray-100 px-2 py-1 rounded">{ltres}</span>
							</div>
							<input id="ltres" type="range" min="0.1" max="5" step="0.1" bind:value={ltres} class="w-full accent-black" />
						</div>
						
						<div class="space-y-2">
							<div class="flex justify-between items-end">
								<div>
									<label for="qtres" class="text-gray-900 font-medium block">Curve Smoothness</label>
									<span class="text-xs text-gray-500 block max-w-[200px]">Lower = hugs original lines tightly, Higher = smoother curves</span>
								</div>
								<span class="text-gray-700 font-mono text-sm bg-gray-100 px-2 py-1 rounded">{qtres}</span>
							</div>
							<input id="qtres" type="range" min="0.1" max="5" step="0.1" bind:value={qtres} class="w-full accent-black" />
						</div>

						<div class="space-y-2">
							<div class="flex justify-between items-end">
								<div>
									<label for="pathomit" class="text-gray-900 font-medium block">Speckle Removal</label>
									<span class="text-xs text-gray-500 block max-w-[200px]">Higher = removes stray dots and noise, Lower = keeps everything</span>
								</div>
								<span class="text-gray-700 font-mono text-sm bg-gray-100 px-2 py-1 rounded">{pathomit}</span>
							</div>
							<input id="pathomit" type="range" min="0" max="64" step="1" bind:value={pathomit} class="w-full accent-black" />
						</div>
					</div>

					<button 
						onclick={trace}
						disabled={isConverting}
						class="w-full py-3.5 px-4 bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-colors flex items-center justify-center gap-2 shadow-sm"
					>
						{#if isConverting}
							<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Tracing...
						{:else}
							Generate Vector (SVG)
						{/if}
					</button>
				</div>
			</section>
			{/if}

			{#if originalSvg}
			<!-- Unified Result Viewer -->
			<section class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" aria-label="Result Viewer">
				
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
					<div>
						<h2 class="text-xl font-bold flex items-center gap-2">
							Vector Result
							{#if optimizedSvg}
								<span class="bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded-full font-medium">
									Optimized (Reduced by {Math.round((1 - optimizedSize/svgSize)*100)}%)
								</span>
							{/if}
						</h2>
					</div>
					
					<div class="flex flex-wrap items-center gap-3">
						<button 
							onclick={() => download(originalSvg as string, 'arco-traced-raw.svg')}
							class="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors text-black"
						>
							Download Raw
						</button>
						{#if optimizedSvg}
							<button 
								onclick={() => download(optimizedSvg as string, 'arco-optimized.svg')}
								class="px-4 py-2 bg-black hover:bg-gray-800 text-sm font-medium rounded-lg transition-colors text-white shadow-sm"
							>
								Download Optimized
							</button>
						{/if}
					</div>
				</div>

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="relative w-full h-[60vh] min-h-[400px] bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 shadow-inner flex flex-col" style="touch-action: none;" bind:this={viewerContainer} onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp} onpointerleave={onPointerLeave}>
					
					<!-- Top Status Labels -->
					{#if optimizedSvg}
						<div class="absolute top-4 left-4 z-20 flex gap-2">
							<span class="bg-white/90 backdrop-blur text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-gray-200 text-gray-600">
								Raw ({formatBytes(svgSize)})
							</span>
						</div>
						<div class="absolute top-4 right-4 z-20 flex gap-2">
							<span class="bg-white/90 backdrop-blur text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-gray-200 text-emerald-600">
								Optimized ({formatBytes(optimizedSize)})
							</span>
						</div>
					{/if}

					<!-- Floating Direct Zoom Controls -->
					<div class="absolute bottom-6 right-6 z-30 flex items-center bg-white/90 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-1">
						<button onclick={() => handleZoom(-0.2)} class="p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-700" aria-label="Zoom out">
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
						</button>
						<div class="flex items-center justify-center w-14 text-sm font-bold text-gray-800 select-none">
							{Math.round(zoomLevel * 100)}%
						</div>
						<button onclick={() => handleZoom(0.2)} class="p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-700" aria-label="Zoom in">
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
						</button>
					</div>

					<!-- Viewport -->
					<div class="flex-1 relative bg-gray-50 overflow-hidden">
						{#if !optimizedSvg}
							<div class="absolute inset-0">
								<div style="transform: translate({panX}px, {panY}px) scale({zoomLevel}); transform-origin: 0 0; {isPinching || isPanning ? '' : 'transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);'}" class="w-full h-full flex items-center justify-center p-4">
									<div class="w-full h-full flex items-center justify-center pointer-events-none">
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html originalSvg}
									</div>
								</div>
							</div>
						{:else}
							<!-- Comparison Wrapper -->
							<!-- Base Layer (Optimized) -->
							<div class="absolute inset-0">
								<div style="transform: translate({panX}px, {panY}px) scale({zoomLevel}); transform-origin: 0 0; {isPinching || isPanning ? '' : 'transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);'}" class="w-full h-full flex items-center justify-center p-4">
									<div class="w-full h-full flex items-center justify-center pointer-events-none">
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html optimizedSvg}
									</div>
								</div>
							</div>

							<!-- Clipped Layer (Raw) -->
							<div class="absolute inset-0 pointer-events-none" style="clip-path: polygon(0 0, {splitPos}% 0, {splitPos}% 100%, 0 100%);" bind:this={clipViewport}>
								<div style="transform: translate({panX}px, {panY}px) scale({zoomLevel}); transform-origin: 0 0; {isPinching || isPanning ? '' : 'transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);'}" class="w-full h-full flex items-center justify-center p-4">
									<div class="w-full h-full flex items-center justify-center pointer-events-none">
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html originalSvg}
									</div>
								</div>
							</div>

							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- Custom Draggable Split Line -->
							<div class="absolute inset-y-0 w-1 bg-black z-10 shadow-[0_0_0_1px_rgba(255,255,255,0.2)] touch-none select-none hover:bg-gray-800" 
								style="left: {splitPos}%; transform: translateX(-50%); cursor: ew-resize;"
								onpointerdown={onPointerDownSplit}
								onpointermove={onPointerMoveSplit}
								onpointerup={onPointerUpSplit}
								onpointercancel={onPointerUpSplit}
							>
								<!-- Dragger Handle -->
								<div class="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-10 h-10 bg-white border-2 border-black rounded-full flex items-center justify-center shadow-lg transition-transform {isDraggingSplit ? 'scale-95 bg-gray-50' : ''}">
									<svg class="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" transform="rotate(90 12 12)" />
									</svg>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Optimization Prompt -->
				{#if !optimizedSvg}
				<div class="pt-6 flex flex-col items-center text-center space-y-4">
					<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 max-w-lg w-full">
						<h3 class="font-bold text-gray-900 mb-2">Want a smaller file size with cleaner paths?</h3>
						<p class="text-sm text-gray-600 mb-6">Running SVGO will merge overlapping paths, round crazy decimal points, and compress the math.</p>
						<button 
							onclick={optimizeSvg}
							disabled={isOptimizing}
							class="w-full py-3.5 px-6 bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-colors shadow-sm inline-flex items-center justify-center gap-2"
						>
							{#if isOptimizing}
								<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Optimizing...
							{:else}
								Optimize with SVGO
							{/if}
						</button>
					</div>
				</div>
				{/if}
			</section>
			{/if}

		</main>
	</div>
</div>
