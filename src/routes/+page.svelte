<script lang="ts">
	import { optimize } from 'svgo/browser';
	import ImageTracer from 'imagetracerjs';

	let fileInput: HTMLInputElement;
	let isDragging = $state(false);
	let isConverting = $state(false);

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

	function formatBytes(bytes: number) {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB'];
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

		const reader = new FileReader();
		reader.onload = (e) => {
			rasterDataUrl = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function convert() {
		if (!rasterDataUrl) return;
		isConverting = true;

		// Small delay to allow UI to update
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
			}
		} catch (error) {
			console.error("Conversion error:", error);
			alert("An error occurred during conversion.");
		} finally {
			isConverting = false;
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

<div class="min-h-screen bg-neutral-900 text-neutral-100 font-sans selection:bg-indigo-500/30 p-8">
	<div class="max-w-5xl mx-auto space-y-8">
		<header class="text-center space-y-4">
			<h1 class="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent inline-block">
				Arco
			</h1>
			<p class="text-neutral-400 text-lg max-w-xl mx-auto">
				Transform your raster line art into clean, ultra-optimized SVGs directly in your browser.
			</p>
		</header>

		<main class="grid grid-cols-1 lg:grid-cols-12 gap-8">
			<div class="lg:col-span-4 space-y-6">
				<div 
					role="button"
					tabindex="0"
					class="relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-8 text-center cursor-pointer min-h-[240px] {isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-neutral-700 hover:border-neutral-500 hover:bg-neutral-800/50'}"
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
					>
					<div class="space-y-4 pointer-events-none">
						<div class="w-16 h-16 mx-auto rounded-full bg-neutral-800 flex items-center justify-center text-indigo-400">
							<svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
							</svg>
						</div>
						<div>
							<p class="font-medium text-neutral-200">Click or drag image to upload</p>
							<p class="text-sm text-neutral-500 mt-1">PNG or JPG (Line art recommended)</p>
						</div>
					</div>
				</div>

				<div class="bg-neutral-800/50 backdrop-blur-sm rounded-2xl p-6 border border-neutral-700/50 space-y-6">
					<h3 class="font-semibold text-lg flex items-center gap-2">
						<svg class="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
						</svg>
						Tracing Options
					</h3>
					
					<div class="space-y-4">
						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<label for="ltres" class="text-neutral-400">Line Threshold</label>
								<span class="text-neutral-200 font-mono">{ltres}</span>
							</div>
							<input id="ltres" type="range" min="0.1" max="5" step="0.1" bind:value={ltres} class="w-full accent-indigo-500" />
						</div>
						
						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<label for="qtres" class="text-neutral-400">Quadratic Spline Threshold</label>
								<span class="text-neutral-200 font-mono">{qtres}</span>
							</div>
							<input id="qtres" type="range" min="0.1" max="5" step="0.1" bind:value={qtres} class="w-full accent-purple-500" />
						</div>

						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<label for="pathomit" class="text-neutral-400">Path Omit (Noise Filter)</label>
								<span class="text-neutral-200 font-mono">{pathomit}</span>
							</div>
							<input id="pathomit" type="range" min="0" max="64" step="1" bind:value={pathomit} class="w-full accent-pink-500" />
						</div>
					</div>

					<button 
						onclick={convert}
						disabled={!rasterDataUrl || isConverting}
						class="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium text-white shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
					>
						{#if isConverting}
							<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Converting...
						{:else}
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
							</svg>
							Vectorize & Optimize
						{/if}
					</button>
				</div>
			</div>

			<div class="lg:col-span-8 grid grid-rows-2 gap-6 min-h-[600px]">
				<div class="bg-neutral-800/30 rounded-2xl border border-neutral-700/50 flex flex-col overflow-hidden relative">
					<div class="p-4 border-b border-neutral-700/50 flex justify-between items-center bg-neutral-800/80">
						<h3 class="font-medium text-neutral-300">Original Source</h3>
						{#if rasterDataUrl}
							<span class="text-xs px-2.5 py-1 bg-neutral-700 rounded-full text-neutral-300 font-mono">
								{formatBytes(originalSize)}
							</span>
						{/if}
					</div>
					<div class="flex-1 p-6 flex items-center justify-center bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzIyMiIvPgo8cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzMzMiLz4KPHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzMzMiLz4KPC9zdmc+')]">
						{#if rasterDataUrl}
							<img src={rasterDataUrl} alt="Source" class="max-w-full max-h-[300px] object-contain drop-shadow-2xl" />
						{:else}
							<span class="text-neutral-600">No image selected</span>
						{/if}
					</div>
				</div>

				<div class="bg-neutral-800/30 rounded-2xl border border-neutral-700/50 flex flex-col overflow-hidden relative">
					<div class="p-4 border-b border-neutral-700/50 flex justify-between items-center bg-neutral-800/80">
						<h3 class="font-medium flex items-center gap-2">
							<span class="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">Optimized SVG</span>
						</h3>
						{#if optimizedSvg}
							<div class="flex items-center gap-3">
								<div class="flex flex-col items-end mr-4">
									<span class="text-xs text-neutral-400">Raw: {formatBytes(svgSize)}</span>
									<span class="text-sm font-medium text-emerald-400">Opt: {formatBytes(optimizedSize)}</span>
								</div>
								<button 
									onclick={() => download(optimizedSvg as string, 'arco-optimized.svg')}
									class="px-4 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 text-white"
								>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
									</svg>
									Download
								</button>
							</div>
						{/if}
					</div>
					<div class="flex-1 p-6 flex items-center justify-center bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzIyMiIvPgo8cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzMzMiLz4KPHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzMzMiLz4KPC9zdmc+')] relative overflow-hidden group">
						{#if optimizedSvg}
							<div class="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto drop-shadow-2xl">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html optimizedSvg}
							</div>
						{:else if isConverting}
							<div class="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/50 backdrop-blur-sm z-10 text-indigo-400 space-y-4">
								<svg class="animate-spin h-10 w-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								<span class="font-medium animate-pulse">Processing vector math...</span>
							</div>
						{:else}
							<span class="text-neutral-600">Output will appear here</span>
						{/if}
					</div>
				</div>
			</div>
		</main>
	</div>
</div>
