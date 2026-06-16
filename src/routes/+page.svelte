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

	// Zoom
	let rawZoom = $state(1);
	let optZoom = $state(1);

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
		rawZoom = 1;
		optZoom = 1;

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
		optZoom = 1;
		rawZoom = 1;

		await new Promise(r => setTimeout(r, 50));

		try {
			originalSvg = await new Promise((resolve) => {
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

			if (originalSvg) {
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

			optimizedSvg = result.data;
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
			<section class="grid grid-cols-1 md:grid-cols-2 gap-8" aria-label="Tracing options and preview">
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
					
					<div class="space-y-5">
						<div class="space-y-1.5">
							<div class="flex justify-between text-sm">
								<label for="ltres" class="text-gray-700 font-medium">Line Threshold</label>
								<span class="text-gray-500">{ltres}</span>
							</div>
							<input id="ltres" type="range" min="0.1" max="5" step="0.1" bind:value={ltres} class="w-full accent-black" />
						</div>
						
						<div class="space-y-1.5">
							<div class="flex justify-between text-sm">
								<label for="qtres" class="text-gray-700 font-medium">Quadratic Threshold</label>
								<span class="text-gray-500">{qtres}</span>
							</div>
							<input id="qtres" type="range" min="0.1" max="5" step="0.1" bind:value={qtres} class="w-full accent-black" />
						</div>

						<div class="space-y-1.5">
							<div class="flex justify-between text-sm">
								<label for="pathomit" class="text-gray-700 font-medium">Noise Filter (Path Omit)</label>
								<span class="text-gray-500">{pathomit}</span>
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
							Generate SVG
						{/if}
					</button>
				</div>
			</section>
			{/if}

			{#if originalSvg}
			<!-- Raw SVG Result -->
			<section class="space-y-4" aria-label="Raw SVG Result">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
					<div>
						<h2 class="text-xl font-bold">Traced SVG Result</h2>
						<p class="text-sm text-gray-500">File size: {formatBytes(svgSize)}</p>
					</div>
					
					<div class="flex items-center gap-4 w-full sm:w-auto">
						<div class="flex items-center gap-2 flex-1 sm:flex-none">
							<span class="text-xs text-gray-500">Zoom</span>
							<input type="range" min="0.1" max="3" step="0.1" bind:value={rawZoom} class="w-24 accent-black" aria-label="Zoom raw SVG" />
							<span class="text-xs text-gray-500 w-8">{Math.round(rawZoom * 100)}%</span>
						</div>
						<button 
							onclick={() => download(originalSvg as string, 'arco-traced.svg')}
							class="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors text-black"
						>
							Download
						</button>
					</div>
				</div>

				<div class="bg-gray-50 rounded-2xl overflow-auto border border-gray-100 h-[400px] p-4 flex items-center justify-center">
					<div class="origin-center transition-transform duration-200 min-w-full min-h-full flex items-center justify-center" style="transform: scale({rawZoom})">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html originalSvg}
					</div>
				</div>

				<!-- Optimization Prompt -->
				{#if !optimizedSvg}
				<div class="pt-6 flex flex-col items-center text-center space-y-4">
					<p class="text-gray-600">Want a smaller file size with cleaner paths?</p>
					<button 
						onclick={optimizeSvg}
						disabled={isOptimizing}
						class="py-3 px-6 bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-colors shadow-sm inline-flex items-center gap-2"
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
				{/if}
			</section>
			{/if}

			{#if optimizedSvg}
			<!-- Optimized SVG Result -->
			<section class="space-y-4 pt-8 border-t border-gray-100" aria-label="Optimized SVG Result">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
					<div>
						<h2 class="text-xl font-bold flex items-center gap-2">
							Optimized SVG
							<span class="bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded-full font-medium">Reduced by {Math.round((1 - optimizedSize/svgSize)*100)}%</span>
						</h2>
						<p class="text-sm text-gray-500">File size: {formatBytes(optimizedSize)} (was {formatBytes(svgSize)})</p>
					</div>
					
					<div class="flex items-center gap-4 w-full sm:w-auto">
						<div class="flex items-center gap-2 flex-1 sm:flex-none">
							<span class="text-xs text-gray-500">Zoom</span>
							<input type="range" min="0.1" max="3" step="0.1" bind:value={optZoom} class="w-24 accent-black" aria-label="Zoom optimized SVG" />
							<span class="text-xs text-gray-500 w-8">{Math.round(optZoom * 100)}%</span>
						</div>
						<button 
							onclick={() => download(optimizedSvg as string, 'arco-optimized.svg')}
							class="px-4 py-2 bg-black hover:bg-gray-800 text-sm font-medium rounded-lg transition-colors text-white shadow-sm"
						>
							Download
						</button>
					</div>
				</div>

				<div class="bg-gray-50 rounded-2xl overflow-auto border border-gray-100 h-[400px] p-4 flex items-center justify-center">
					<div class="origin-center transition-transform duration-200 min-w-full min-h-full flex items-center justify-center" style="transform: scale({optZoom})">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html optimizedSvg}
					</div>
				</div>
			</section>
			{/if}

		</main>
	</div>
</div>
