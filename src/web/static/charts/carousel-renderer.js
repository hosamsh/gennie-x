/**
 * Quotes carousel renderer
 * Displays rotating quotes with navigation
 */

import { escapeHtml } from './utils.js';

function parseAttributedQuote(rawValue) {
	const value = String(rawValue ?? '').trim();

	const match = value.match(/^(user|assistant)\s*:\s*(.+)$/i);
	if (!match) {
		return {
			speaker: null,
			icon: '💬',
			label: 'Quote',
			text: value,
		};
	}

	const speaker = String(match[1]).toLowerCase();
	let text = String(match[2] ?? '').trim();

	if (
		(text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
		(text.startsWith('"') && text.endsWith('"') && text.length >= 2)
	) {
		text = text.slice(1, -1).trim();
	}

	if (speaker === 'user') {
		return { speaker, icon: '👤', label: 'User', text };
	}

	if (speaker === 'assistant') {
		return { speaker, icon: '🤖', label: 'Assistant', text };
	}

	return { speaker: null, icon: '💬', label: 'Quote', text: value };
}

/**
 * Render quotes carousel
 */
export function renderQuotesCarousel(chartConfig, chartData) {
	if (!Array.isArray(chartData) || chartData.length === 0) {
		return '';
	}
    
	const carouselId = `carousel-${chartConfig.id.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`;
	const title = chartConfig.title || 'Quotes';
    
	// Navigation dots
	const dotsHtml = chartData.map((_, idx) => 
		`<button onclick="goToSlide('${carouselId}', ${idx})" 
				class="carousel-dot w-2.5 h-2.5 rounded-full transition-all duration-300 ${idx === 0 ? 'bg-white w-8' : 'bg-white/40 hover:bg-white/60'}" 
				data-index="${idx}"></button>`
	).join('');
    
	return `
		<div class="rounded-xl shadow-lg overflow-hidden md:col-span-2">
			<div id="${carouselId}" class="quotes-carousel relative bg-gradient-to-br from-orange-500 to-rose-500 text-white" data-current="0" data-total="${chartData.length}">
				<!-- Large quote mark decoration -->
				<div class="absolute top-4 right-6 text-8xl text-white/15 font-serif leading-none select-none">"</div>
                
				<!-- Slides container -->
				<div class="carousel-slides relative min-h-[200px] px-10 py-12 flex items-center justify-center">
					${chartData.map((d, idx) => `
						${(() => {
							const q = parseAttributedQuote(d.value);
							const safeText = escapeHtml(q.text);
							const safeLabel = escapeHtml(q.label);
							return `
						<div class="carousel-slide absolute inset-0 px-10 py-12 flex items-center justify-center transition-all duration-500 ease-out ${idx === 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}" data-index="${idx}">
							<div class="flex items-center gap-8 w-11/12">
								<div class="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center text-6xl flex-shrink-0" aria-hidden="true">${q.icon}</div>
								<div class="flex flex-col gap-2 flex-1 min-w-0">
									<p class="text-2xl md:text-3xl lg:text-4xl font-bold italic leading-relaxed text-left break-words">${safeText}</p>
									<div class="text-xs uppercase tracking-wider opacity-90 text-left">${safeLabel}</div>
								</div>
							</div>
						</div>
							`;
						})()}
					`).join('')}
				</div>
                
				<!-- Bottom section with navigation -->
				<div class="px-8 pb-5 flex items-center justify-between">
					<div class="flex items-center gap-3">
						<span class="text-2xl">🌶️</span>
						<span class="text-sm font-medium opacity-90">${escapeHtml(title.replace(/🌶️\s*/, ''))}</span>
					</div>
					<div class="flex items-center gap-3">
						<div class="flex gap-1.5">
							${dotsHtml}
						</div>
						<div class="flex gap-1">
							<button onclick="prevSlide('${carouselId}')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
							</button>
							<button onclick="nextSlide('${carouselId}')" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	`;
}
