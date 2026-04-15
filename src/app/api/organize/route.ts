import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { existsSync, mkdirSync, statSync, readdirSync, linkSync, copyFileSync, renameSync, writeFileSync } from 'fs'
import { join, dirname, basename, extname, resolve } from 'path'

// ============================================
// File Organization API
// Organizes downloaded media files into a structured library
// Supports hardlink-first strategy for NAS usage
// Uses native fs operations (no shell exec) to prevent command injection
// ============================================

// POST /api/organize
// Body: { mediaItemId? | downloadTaskId? | mode?: 'hardlink' | 'move' | 'copy' | 'dryrun' }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mediaItemId, downloadTaskId, mode } = body
    const organizeMode = mode || 'hardlink'

    // Find completed downloads to organize
    const where: Record<string, unknown> = { status: 'completed' }

    if (downloadTaskId) {
      where.id = downloadTaskId
    } else if (mediaItemId) {
      where.mediaItemId = mediaItemId
    }

    const completedTasks = await db.downloadTask.findMany({
      where,
      include: {
        mediaItem: true,
        client: true,
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
    })

    if (completedTasks.length === 0) {
      return NextResponse.json({
        success: true,
        organized: 0,
        message: '没有已完成的下载任务需要整理',
      })
    }

    // Get organize settings
    const movieFolder = (await getSetting('movie_library_path')) || '/media/movies'
    const tvFolder = (await getSetting('tv_library_path')) || '/media/tv'
    const preferredMode = (await getSetting('organize_mode')) || organizeMode

    const results: Array<{
      taskId: string
      title: string
      success: boolean
      sourcePath: string
      targetPath: string
      method: string
      error?: string
    }> = []

    for (const task of completedTasks) {
      if (!task.outputPath) {
        results.push({
          taskId: task.id,
          title: task.title,
          success: false,
          sourcePath: '',
          targetPath: '',
          method: preferredMode,
          error: '没有输出路径',
        })
        continue
      }

      try {
        const sourceDir = task.outputPath
        if (!existsSync(sourceDir)) {
          results.push({
            taskId: task.id,
            title: task.title,
            success: false,
            sourcePath: sourceDir,
            targetPath: '',
            method: preferredMode,
            error: '源目录不存在',
          })
          continue
        }

        // Determine media type and build target path
        const mediaType = task.mediaItem?.type || guessMediaTypeFromTitle(task.title)
        const mediaTitle = buildMediaTitle(task)
        const targetDir = mediaType === 'tv'
          ? buildTvPath(tvFolder, mediaTitle, task.title)
          : buildMoviePath(movieFolder, mediaTitle, task.title)

        if (preferredMode === 'dryrun') {
          results.push({
            taskId: task.id,
            title: task.title,
            success: true,
            sourcePath: sourceDir,
            targetPath: targetDir,
            method: 'dryrun',
          })
          continue
        }

        // Create target directory
        mkdirSync(targetDir, { recursive: true })

        // Find media files in source directory
        const mediaFiles = findMediaFiles(sourceDir)
        if (mediaFiles.length === 0) {
          results.push({
            taskId: task.id,
            title: task.title,
            success: false,
            sourcePath: sourceDir,
            targetPath: targetDir,
            method: preferredMode,
            error: '未找到媒体文件',
          })
          continue
        }

        // Copy/link each file
        let successCount = 0
        for (const file of mediaFiles) {
          const targetFile = join(targetDir, mediaType === 'tv'
            ? buildTvFilename(task.title, file, sourceDir)
            : buildMovieFilename(mediaTitle, file, sourceDir))

          try {
            const safeSource = resolve(file)
            const safeTarget = resolve(targetFile)
            // Validate paths are within expected directories
            if (!safeSource.startsWith(sourceDir) || !safeTarget.startsWith(targetDir)) {
              console.error(`Security: path traversal detected: ${file} -> ${targetFile}`)
              continue
            }
            if (preferredMode === 'hardlink') {
              // Try hardlink first, fall back to copy
              try {
                linkSync(safeSource, safeTarget)
                successCount++
              } catch {
                // Hardlink failed (different filesystem?), try copy
                copyFileSync(safeSource, safeTarget)
                successCount++
              }
            } else if (preferredMode === 'move') {
              renameSync(safeSource, safeTarget)
              successCount++
            } else {
              // Copy mode
              copyFileSync(safeSource, safeTarget)
              successCount++
            }
          } catch (err) {
            console.error(`Failed to organize file ${file}:`, err)
          }
        }

        // Also copy subtitle files
        const subtitleFiles = findSubtitleFiles(sourceDir)
        for (const file of subtitleFiles) {
          const safeSubSource = resolve(file)
          const safeSubTarget = resolve(join(targetDir, basename(file)))
          if (!safeSubSource.startsWith(sourceDir) || !safeSubTarget.startsWith(targetDir)) continue
          try {
            if (preferredMode === 'move') {
              renameSync(safeSubSource, safeSubTarget)
            } else {
              try {
                linkSync(safeSubSource, safeSubTarget)
              } catch {
                copyFileSync(safeSubSource, safeSubTarget)
              }
            }
          } catch {}
        }

        if (successCount > 0) {
          // Update task and media item status
          await db.downloadTask.update({
            where: { id: task.id },
            data: {
              status: 'imported',
              outputPath: targetDir,
            },
          })

          if (task.mediaItemId) {
            await db.mediaItem.update({
              where: { id: task.mediaItemId },
              data: { status: 'organized' },
            })
          }

          results.push({
            taskId: task.id,
            title: task.title,
            success: true,
            sourcePath: sourceDir,
            targetPath: targetDir,
            method: preferredMode,
          })
        } else {
          results.push({
            taskId: task.id,
            title: task.title,
            success: false,
            sourcePath: sourceDir,
            targetPath: targetDir,
            method: preferredMode,
            error: '所有文件整理失败',
          })
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        results.push({
          taskId: task.id,
          title: task.title,
          success: false,
          sourcePath: task.outputPath || '',
          targetPath: '',
          method: preferredMode,
          error: errorMsg,
        })
      }
    }

    const successCount = results.filter((r) => r.success).length

    // Fire notification for organize completion (async, non-blocking)
    if (successCount > 0) {
      const organizedTitles = results.filter((r) => r.success).map((r) => r.title).slice(0, 5).join('、')
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/notifications/action/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'organize_complete',
          body: `已整理 ${successCount} 个媒体文件${results.length > successCount ? `，${results.length - successCount} 个失败` : ''}\n${organizedTitles}${results.filter((r) => r.success).length > 5 ? '...' : ''}`,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      organized: successCount,
      total: results.length,
      mode: preferredMode,
      results,
      message: `整理完成：${successCount}/${results.length} 个任务成功`,
    })
  } catch (error) {
    console.error('Organize error:', error)
    return NextResponse.json({ error: '整理失败' }, { status: 500 })
  }
}

// GET /api/organize/settings
export async function GET() {
  try {
    const settings = {
      movieLibraryPath: await getSetting('movie_library_path') || '/media/movies',
      tvLibraryPath: await getSetting('tv_library_path') || '/media/tv',
      organizeMode: await getSetting('organize_mode') || 'hardlink',
      movieNamingPattern: await getSetting('movie_naming_pattern') || '{title} ({year})/{title} ({year})',
      tvNamingPattern: await getSetting('tv_naming_pattern') || '{title}/Season {season}/{title} - S{season:02d}E{episode:02d}',
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Organize settings error:', error)
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 })
  }
}

// PUT /api/organize/settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { movieLibraryPath, tvLibraryPath, organizeMode } = body

    if (movieLibraryPath) await setSetting('movie_library_path', movieLibraryPath)
    if (tvLibraryPath) await setSetting('tv_library_path', tvLibraryPath)
    if (organizeMode) await setSetting('organize_mode', organizeMode)

    return NextResponse.json({ success: true, message: '设置已保存' })
  } catch (error) {
    console.error('Organize settings save error:', error)
    return NextResponse.json({ error: '保存设置失败' }, { status: 500 })
  }
}

// ============================================
// Helper functions
// ============================================

async function getSetting(key: string): Promise<string | null> {
  const setting = await db.setting.findUnique({ where: { key } })
  return setting?.value || null
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

function guessMediaTypeFromTitle(title: string): 'movie' | 'tv' {
  // Common patterns for TV shows
  if (/\bS\d{1,2}\b/i.test(title)) return 'tv' // S01, S12
  if (/\bE\d{1,3}\b/i.test(title)) return 'tv' // E01, E123
  if (/\d{1,2}x\d{2}/i.test(title)) return 'tv' // 1x01
  if (/第\s*\d+\s*季/i.test(title)) return 'tv' // 第一季
  if (/第\s*\d+\s*集/i.test(title)) return 'tv' // 第一集
  if (/Season\s*\d+/i.test(title)) return 'tv'
  if (/Complete\s*Series/i.test(title)) return 'tv'
  return 'movie'
}

function buildMediaTitle(task: Record<string, unknown>): string {
  const mediaItem = task.mediaItem as Record<string, unknown> | undefined
  if (mediaItem) {
    return String(mediaItem.titleCn || mediaItem.titleEn || '')
  }
  // Fallback: extract from task title
  return cleanTitle(String(task.title))
}

function cleanTitle(title: string): string {
  return title
    .replace(/\[.*?\]/g, '')     // Remove brackets content
    .replace(/\(.*?\)/g, '')     // Remove parentheses (keep year)
    .replace(/\{.*?\}/g, '')
    .replace(/[-_]\s*/g, ' ')   // Replace separators
    .replace(/\d{3,4}p/gi, '')
    .replace(/H\.?26[45]/gi, '')
    .replace(/x26[45]/gi, '')
    .replace(/HEVC|AVC|AV1/gi, '')
    .replace(/BluRay|WEB-?DL|WEBRip|HDTV|Remux|DVDRip/gi, '')
    .replace(/AAC|DTS|Atmos|FLAC/gi, '')
    .replace(/GB|MB|TB/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildMoviePath(baseFolder: string, mediaTitle: string, _taskTitle: string): string {
  // Try to extract year from title
  const yearMatch = _taskTitle.match(/(?:19|20)\d{2}/)
  const year = yearMatch ? yearMatch[0] : ''
  const folderName = year ? `${mediaTitle} (${year})` : mediaTitle
  return join(baseFolder, folderName)
}

function buildTvPath(baseFolder: string, mediaTitle: string, taskTitle: string): string {
  // Try to extract season number
  const seasonMatch = taskTitle.match(/\bS(\d{1,2})\b/i)
    || taskTitle.match(/第\s*(\d+)\s*季/)
    || taskTitle.match(/Season\s*(\d+)/i)
  const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1
  const folderName = mediaTitle
  const seasonFolder = `Season ${String(seasonNum).padStart(2, '0')}`
  return join(baseFolder, folderName, seasonFolder)
}

function buildMovieFilename(mediaTitle: string, filePath: string, sourceDir: string): string {
  const ext = extname(filePath)
  const title = mediaTitle || basename(sourceDir)
  return `${title}${ext}`
}

function buildTvFilename(taskTitle: string, filePath: string, _sourceDir: string): string {
  const ext = extname(filePath)
  // Try to extract S01E01 pattern from filename
  const seMatch = basename(filePath).match(/S(\d{1,2})E(\d{1,3})/i)
    || taskTitle.match(/S(\d{1,2})E(\d{1,3})/i)

  if (seMatch) {
    return `S${seMatch[1].padStart(2, '0')}E${seMatch[2].padStart(2, '0')}${ext}`
  }

  // Try Episode number
  const epMatch = taskTitle.match(/第?\s*(\d+)\s*集/) || taskTitle.match(/E(\d{1,3})/i)
  if (epMatch) {
    const epNum = parseInt(epMatch[1], 10)
    return `E${String(epNum).padStart(2, '0')}${ext}`
  }

  return basename(filePath)
}

const MEDIA_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.wmv', '.flv', '.mov', '.ts', '.m2ts',
  '.rmvb', '.rm', '.iso', '.mpg', '.mpeg', '.3gp', '.webm',
])

const SUBTITLE_EXTENSIONS = new Set([
  '.srt', '.ass', '.ssa', '.sub', '.idx', '.smi', '.sup', '.vtt',
  '.cht', '.chs', '.tc.srt', '.sc.srt',
])

function findMediaFiles(dir: string): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Recurse into subdirectories (skip sample dirs)
        if (!/sample| extras? |\.unwanted/i.test(entry.name)) {
          files.push(...findMediaFiles(fullPath))
        }
      } else if (entry.isFile() && MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        // Skip sample files
        if (!/sample/i.test(entry.name) && statSync(fullPath).size > 50 * 1024 * 1024) { // > 50MB
          files.push(fullPath)
        }
      }
    }
  } catch {}
  return files
}

function findSubtitleFiles(dir: string): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!/sample| extras? /i.test(entry.name)) {
          files.push(...findSubtitleFiles(fullPath))
        }
      } else if (entry.isFile() && SUBTITLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(fullPath)
      }
    }
  } catch {}
  return files
}
