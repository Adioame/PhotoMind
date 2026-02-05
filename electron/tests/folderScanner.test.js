/**
 * PhotoMind - FolderScanner 单元测试
 */
import assert from 'assert'
import { promises as fs } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// 导入被测试的模块 (使用编译后的文件)
const { folderScanner } = await import('../../dist-electron/services/folderScanner.js')

// 测试临时目录
const testDir = join(__dirname, '../../test-fixtures')

/**
 * 测试: scanFolder 基本扫描功能
 */
async function testScanFolder() {
  console.log('Running test: scanFolder...')

  // 创建测试目录结构
  const testRoot = join(testDir, 'scan-test')
  await fs.mkdir(join(testRoot, 'subdir1'), { recursive: true })
  await fs.mkdir(join(testRoot, 'subdir2'), { recursive: true })

  // 创建测试文件
  await fs.writeFile(join(testRoot, 'test1.jpg'), 'test content 1')
  await fs.writeFile(join(testRoot, 'test2.png'), 'test content 2')
  await fs.writeFile(join(testRoot, 'subdir1', 'test3.jpg'), 'test content 3')
  await fs.writeFile(join(testRoot, 'subdir2', 'test4.txt'), 'not an image')
  await fs.writeFile(join(testRoot, '.hidden.jpg'), 'hidden file')

  // 执行扫描
  const files = await folderScanner.scanFolder(testRoot)

  // 验证结果
  assert(files.length >= 3, `Expected at least 3 files, got ${files.length}`)

  const jpgFiles = files.filter(f => f.extension === '.jpg')
  assert(jpgFiles.length >= 2, `Expected at least 2 jpg files`)

  const hiddenFiles = files.filter(f => f.filename === '.hidden.jpg')
  assert(hiddenFiles.length === 0, 'Hidden files should be skipped by default')

  // 清理
  await fs.rm(testRoot, { recursive: true, force: true })

  console.log('✓ testScanFolder passed')
}

/**
 * 测试: scanFolder 跳过不支持的格式
 */
async function testScanFolderSkipsUnsupportedFormats() {
  console.log('Running test: scanFolderSkipsUnsupportedFormats...')

  const testRoot = join(testDir, 'format-test')
  await fs.mkdir(testRoot, { recursive: true })

  await fs.writeFile(join(testRoot, 'valid.jpg'), 'jpg content')
  await fs.writeFile(join(testRoot, 'valid.png'), 'png content')
  await fs.writeFile(join(testRoot, 'invalid.xyz'), 'unsupported content')
  await fs.writeFile(join(testRoot, 'document.pdf'), 'pdf content')

  const files = await folderScanner.scanFolder(testRoot)

  assert(files.length === 2, `Expected 2 files, got ${files.length}`)
  assert(files.every(f => ['.jpg', '.png'].includes(f.extension)), 'Only jpg and png should be included')

  await fs.rm(testRoot, { recursive: true, force: true })

  console.log('✓ testScanFolderSkipsUnsupportedFormats passed')
}

/**
 * 测试: scanFolder 非递归模式
 */
async function testScanFolderNonRecursive() {
  console.log('Running test: scanFolderNonRecursive...')

  const testRoot = join(testDir, 'non-recursive-test')
  await fs.mkdir(join(testRoot, 'subdir'), { recursive: true })

  await fs.writeFile(join(testRoot, 'root.jpg'), 'root content')
  await fs.writeFile(join(testRoot, 'subdir', 'nested.jpg'), 'nested content')

  const files = await folderScanner.scanFolder(testRoot, { recursive: false })
  const rootFiles = files.filter(f => f.filename === 'root.jpg')
  const nestedFiles = files.filter(f => f.filename === 'nested.jpg')

  assert(rootFiles.length === 1, 'Root file should be included')
  assert(nestedFiles.length === 0, 'Nested files should be excluded in non-recursive mode')

  await fs.rm(testRoot, { recursive: true, force: true })

  console.log('✓ testScanFolderNonRecursive passed')
}

/**
 * 测试: getSupportedExtensions
 */
async function testGetSupportedExtensions() {
  console.log('Running test: getSupportedExtensions...')

  const extensions = folderScanner.getSupportedExtensions()

  assert(Array.isArray(extensions), 'Should return an array')
  assert(extensions.length > 0, 'Should have at least one extension')
  assert(extensions.includes('.jpg'), 'Should include .jpg')
  assert(extensions.includes('.png'), 'Should include .png')
  assert(extensions.includes('.heic'), 'Should include .heic')

  console.log('✓ testGetSupportedExtensions passed')
}

/**
 * 测试: isSupportedFile
 */
async function testIsSupportedFile() {
  console.log('Running test: isSupportedFile...')

  assert(folderScanner.isSupportedFile('photo.jpg') === true, '.jpg should be supported')
  assert(folderScanner.isSupportedFile('photo.PNG') === true, '.PNG should be supported (case insensitive)')
  assert(folderScanner.isSupportedFile('document.pdf') === false, '.pdf should not be supported')
  assert(folderScanner.isSupportedFile('noextension') === false, 'Files without extension should not be supported')

  console.log('✓ testIsSupportedFile passed')
}

/**
 * 测试: estimateImportTime
 */
async function testEstimateImportTime() {
  console.log('Running test: estimateImportTime...')

  const files = [
    { path: '/test/file1.jpg', filename: 'file1.jpg', extension: '.jpg', size: 30 * 1024 * 1024, mtime: new Date() },
    { path: '/test/file2.jpg', filename: 'file2.jpg', extension: '.jpg', size: 30 * 1024 * 1024, mtime: new Date() }
  ]

  const estimatedTime = await folderScanner.estimateImportTime(files)

  // 60MB / 30MB/s = 2 seconds
  assert(estimatedTime >= 1, `Estimated time should be at least 1 second, got ${estimatedTime}`)

  console.log(`✓ testEstimateImportTime passed (estimated: ${estimatedTime}s)`)
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('\n=== Running FolderScanner Tests ===\n')

  try {
    await testScanFolder()
    await testScanFolderSkipsUnsupportedFormats()
    await testScanFolderNonRecursive()
    await testGetSupportedExtensions()
    await testIsSupportedFile()
    await testEstimateImportTime()

    console.log('\n=== All FolderScanner Tests Passed! ===\n')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

runTests()
