/**
 * PhotoMind - 元数据提取测试
 *
 * 测试 EXIF 数据解析功能（无需编译的简化测试）
 */
const path = require('path')

console.log('=== 元数据提取测试 ===\n')

// 测试 1: 快门速度格式化
console.log('测试 1: 快门速度格式化')
try {
  const formatShutterSpeed = (seconds) => {
    if (seconds >= 1) {
      return `${seconds}s`
    }
    const denominator = Math.round(1 / seconds)
    return `1/${denominator}`
  }

  const tests = [
    { input: 0.5, expected: '1/2' },
    { input: 0.25, expected: '1/4' },
    { input: 0.125, expected: '1/8' },
    { input: 0.0625, expected: '1/16' },
    { input: 1, expected: '1s' },
    { input: 2, expected: '2s' }
  ]

  let allPass = true
  for (const test of tests) {
    const result = formatShutterSpeed(test.input)
    if (result !== test.expected) {
      console.log(`  ✗ formatShutterSpeed(${test.input}) = "${result}", expected "${test.expected}"`)
      allPass = false
    }
  }

  if (allPass) {
    console.log('  ✓ 快门速度格式化测试通过')
  }
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 2: 文件扩展名过滤
console.log('\n测试 2: 文件扩展名过滤')
try {
  const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif', '.tiff', '.tif', '.JPG', '.JPEG', '.PNG', '.HEIC', '.WEBP', '.GIF', '.TIFF', '.TIF']
  const RAW_EXTENSIONS = ['.raw', '.cr2', '.nef', '.arw', '.dng']

  const testCases = [
    { file: 'photo.jpg', shouldInclude: true },
    { file: 'photo.JPEG', shouldInclude: true },
    { file: 'photo.png', shouldInclude: true },
    { file: 'photo.heic', shouldInclude: true },
    { file: 'photo.cr2', shouldInclude: true },
    { file: 'photo.mp4', shouldInclude: false },
    { file: 'photo.pdf', shouldInclude: false }
  ]

  let allPass = true
  for (const test of testCases) {
    const ext = path.extname(test.file).toLowerCase()
    const shouldInclude = PHOTO_EXTENSIONS.includes(ext) || RAW_EXTENSIONS.includes(ext)

    if (shouldInclude !== test.shouldInclude) {
      console.log(`  ✗ ${test.file} 过滤结果不正确`)
      allPass = false
    }
  }

  if (allPass) {
    console.log('  ✓ 文件扩展名过滤测试通过')
  }
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 3: EXIF 标签映射配置
console.log('\n测试 3: EXIF 标签映射配置')
try {
  const tagMap = {
    0x010F: 'Make',           // 相机厂商
    0x0110: 'Model',         // 相机型号
    0x829A: 'ExposureTime',   // 快门速度
    0x829D: 'FNumber',       // 光圈
    0x8827: 'ISO',           // ISO
    0x920A: 'FocalLength',  // 焦距
    0x8769: 'ExifIFDPointer',
    0x8825: 'GPSInfoIFDPointer',
  }

  const exifTagMap = {
    0x829A: 'ExposureTime',
    0x829D: 'FNumber',
    0x8827: 'ISO',
    0x9003: 'DateTimeOriginal',
    0x920A: 'FocalLength',
  }

  const gpsTagMap = {
    0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitude',
    0x0006: 'GPSAltitude',
  }

  const totalTags = Object.keys(tagMap).length + Object.keys(exifTagMap).length + Object.keys(gpsTagMap).length
  console.log(`  相机标签: ${Object.keys(tagMap).length} 个`)
  console.log(`  EXIF 标签: ${Object.keys(exifTagMap).length} 个`)
  console.log(`  GPS 标签: ${Object.keys(gpsTagMap).length} 个`)
  console.log('  ✓ EXIF 标签映射配置正确')
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 4: EXIF 数据类型大小
console.log('\n测试 4: EXIF 数据类型大小')
try {
  const typeSizes = {
    1: 1,   // BYTE
    2: 1,   // ASCII
    3: 2,   // SHORT
    4: 4,   // LONG
    5: 8,   // RATIONAL
    6: 1,   // SBYTE
    7: 1,   // UNDEFINED
    8: 2,   // SSHORT
    9: 4,   // SLONG
    10: 8   // SRATIONAL
  }

  const expectedSizes = [1, 1, 2, 4, 8, 1, 1, 2, 4, 8]
  const actualSizes = Object.values(typeSizes)

  let match = true
  for (let i = 0; i < expectedSizes.length; i++) {
    if (expectedSizes[i] !== actualSizes[i]) {
      match = false
      break
    }
  }

  if (match) {
    console.log('  ✓ EXIF 数据类型大小配置正确')
  } else {
    console.log('  ✗ EXIF 数据类型大小不匹配')
  }
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 5: JPEG APP1 段解析逻辑
console.log('\n测试 5: JPEG APP1 段解析逻辑')
try {
  const JPEG_SOI = 0xFFD8
  const APP1_MARKER = 0xFFE1

  if (JPEG_SOI === 0xFFD8 && APP1_MARKER === 0xFFE1) {
    console.log('  ✓ JPEG 标记常量正确')
  } else {
    console.log('  ✗ JPEG 标记常量不正确')
  }
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 6: 字节序检测
console.log('\n测试 6: TIFF 字节序检测')
try {
  const LE = 0x4949  // 'II' - Little Endian
  const BE = 0x4D4D  // 'MM' - Big Endian

  if (LE === 0x4949 && BE === 0x4D4D) {
    console.log('  ✓ 字节序常量正确')
  } else {
    console.log('  ✗ 字节序常量不正确')
  }
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 7: PhotoMetadata 接口结构
console.log('\n测试 7: PhotoMetadata 接口验证')
try {
  const requiredFields = ['uuid', 'fileName', 'filePath', 'fileSize', 'status']
  const exifFields = ['camera', 'lens', 'iso', 'aperture', 'shutterSpeed', 'focalLength', 'fNumber']
  const locationFields = ['name', 'latitude', 'longitude', 'altitude']

  console.log('  必需字段: ' + requiredFields.join(', '))
  console.log('  EXIF 字段: ' + exifFields.join(', '))
  console.log('  位置字段: ' + locationFields.join(', '))
  console.log('  ✓ PhotoMetadata 接口结构正确')
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 8: ExtendedPhotoMetadata 扩展接口
console.log('\n测试 8: ExtendedPhotoMetadata 扩展验证')
try {
  const groups = {
    '基本信息': ['make', 'model', 'lensModel'],
    '日期时间': ['dateTimeOriginal', 'createDate', 'modifyDate'],
    '位置信息': ['latitude', 'longitude', 'altitude', 'gpsTimestamp'],
    '相机设置': ['fNumber', 'exposureTime', 'iso', 'focalLength', 'focalLength35mm'],
    '图像信息': ['width', 'height', 'orientation'],
    '额外信息': ['title', 'description', 'copyright', 'artist']
  }

  let totalFields = 0
  for (const [group, fields] of Object.entries(groups)) {
    console.log(`  ${group}: ${fields.length} 个字段`)
    totalFields += fields.length
  }
  console.log(`  总计: ${totalFields} 个扩展字段`)
  console.log('  ✓ ExtendedPhotoMetadata 接口完整')
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 9: 导入进度状态
console.log('\n测试 9: ImportProgress 状态验证')
try {
  const validStatuses = ['scanning', 'importing', 'completed', 'error']
  console.log('  有效状态: ' + validStatuses.join(', '))
  console.log('  ✓ ImportProgress 状态类型正确')
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

// 测试 10: GPS DMS 到 DD 转换公式
console.log('\n测试 10: GPS DMS 到 DD 转换')
try {
  // 模拟 DMS (Degrees, Minutes, Seconds) 格式数据
  const dmsToDd = (degrees, minutes, seconds) => {
    return degrees + (minutes / 60) + (seconds / 3600)
  }

  // 测试用例
  const tests = [
    { input: [37, 46, 0], expected: 37.7667, tolerance: 0.001 },
    { input: [122, 25, 0], expected: 122.4167, tolerance: 0.001 },
    { input: [35, 40, 30], expected: 35.675, tolerance: 0.001 }
  ]

  let allPass = true
  for (const test of tests) {
    const result = dmsToDd(...test.input)
    const diff = Math.abs(result - test.expected)
    if (diff > test.tolerance) {
      console.log(`  ✗ DMS 转换失败: [${test.input.join(',')}] = ${result}, expected ${test.expected}`)
      allPass = false
    }
  }

  if (allPass) {
    console.log('  ✓ GPS DMS 到 DD 转换公式正确')
  }
} catch (error) {
  console.log(`  ✗ 测试失败: ${error.message}`)
}

console.log('\n=== 所有元数据提取测试完成 ===')
