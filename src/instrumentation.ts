/**
 * Next.js Server Instrumentation
 * 
 * This file is automatically loaded by Next.js when the server starts.
 * It initializes background services like the task scheduler.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/configuring/instrumentation
 */

export async function register() {
  // Only run on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize the background task scheduler after a short delay
    // to ensure the server is fully ready
    setTimeout(async () => {
      try {
        const { initTaskScheduler } = await import('@/lib/task-scheduler')
        await initTaskScheduler()
      } catch (error) {
        console.error('[Instrumentation] Failed to initialize task scheduler:', error)
      }
    }, 3000)
  }
}
