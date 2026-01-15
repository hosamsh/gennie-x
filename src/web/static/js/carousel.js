/**
 * Carousel - Quotes carousel navigation
 */

const Carousel = {
    /**
     * Navigate to next slide
     */
    next(carouselId) {
        const carousel = document.getElementById(carouselId);
        if (!carousel) return;
        
        const current = parseInt(carousel.dataset.current);
        const total = parseInt(carousel.dataset.total);
        const next = (current + 1) % total;
        
        this.goToSlide(carouselId, next);
    },

    /**
     * Navigate to previous slide
     */
    prev(carouselId) {
        const carousel = document.getElementById(carouselId);
        if (!carousel) return;
        
        const current = parseInt(carousel.dataset.current);
        const total = parseInt(carousel.dataset.total);
        const prev = (current - 1 + total) % total;
        
        this.goToSlide(carouselId, prev);
    },

    /**
     * Go to specific slide
     */
    goToSlide(carouselId, index) {
        const carousel = document.getElementById(carouselId);
        if (!carousel) return;
        
        const slides = carousel.querySelectorAll('.carousel-slide');
        const dots = carousel.querySelectorAll('.carousel-dot');
        
        slides.forEach((slide, i) => {
            if (i === index) {
                slide.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
                slide.classList.add('opacity-100', 'scale-100');
            } else {
                slide.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                slide.classList.remove('opacity-100', 'scale-100');
            }
        });
        
        dots.forEach((dot, i) => {
            if (i === index) {
                dot.classList.remove('bg-white/40', 'w-2.5');
                dot.classList.add('bg-white', 'w-8');
            } else {
                dot.classList.add('bg-white/40', 'w-2.5');
                dot.classList.remove('bg-white', 'w-8');
            }
        });
        
        carousel.dataset.current = index;
    }
};

// Global functions for onclick handlers in HTML
window.nextSlide = (carouselId) => Carousel.next(carouselId);
window.prevSlide = (carouselId) => Carousel.prev(carouselId);
window.goToSlide = (carouselId, index) => Carousel.goToSlide(carouselId, index);

// Export for use in other modules
window.Carousel = Carousel;
