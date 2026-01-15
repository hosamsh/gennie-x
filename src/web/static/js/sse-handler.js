/**
 * SSE Streaming - Server-Sent Events handling
 */

const SSEHandler = {
    /**
     * Stream extraction output via SSE
     */
    streamExtraction(runId, callbacks = {}) {
        const statusEl = document.getElementById('extraction-run-status');
        statusEl.textContent = 'Running';
        statusEl.className = 'px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 animate-pulse';
        
        const eventSource = new EventSource(`/api/run/${runId}/stream`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'log':
                    const lineType = Modals.detectLogType(data.message);
                    Modals.appendExtractionLog(data.message, lineType);
                    break;
                    
                case 'status':
                    if (data.status === 'completed') {
                        statusEl.textContent = 'Completed';
                        statusEl.className = 'px-2 py-1 text-xs rounded-full bg-green-100 text-green-700';
                        Modals.setExtractionState('completed');
                        if (callbacks.onComplete) callbacks.onComplete();
                    } else if (data.status === 'failed') {
                        statusEl.textContent = 'Failed';
                        statusEl.className = 'px-2 py-1 text-xs rounded-full bg-red-100 text-red-700';
                        Modals.setExtractionState('failed');
                        if (callbacks.onFailed) callbacks.onFailed();
                    }
                    break;
                    
                case 'error':
                    Modals.appendExtractionLog('Error: ' + data.message, 'error');
                    if (callbacks.onError) callbacks.onError(data.message);
                    break;
                    
                case 'done':
                    eventSource.close();
                    break;
            }
        };
        
        eventSource.onerror = () => {
            eventSource.close();
            if (callbacks.onConnectionError) callbacks.onConnectionError();
        };
        
        return eventSource;
    }
};

// Export for use in other modules
window.SSEHandler = SSEHandler;
