// 如何使用：
// 指定一个 exe 文件和若干个搜索目录（ EXE_PATH 、 SEARCH_DIRS ）
// 使用 Dependencies 递归搜索 exe 文件缺少的 dll 文件（ DEPENDENCIES_PATH ）
// 其中只有符合 INCLUDE_PATTERN 的 dll 文件才会被考虑
// 缺少的 dll 文件将被复制到 exe 文件所在的目录
// 无法找到的 dll 将被输出至终端

// How to use:
// Specify an executable file and several searching directories (EXE_PATH, SEARCH_DIRS)
// use Dependencies to recursively search for missing DLLs (DEPENDENCIES_PATH)
// only DLLs matching INCLUDE_PATTERN will be considered
// missing DLLs will be copied into executable file's directory
// DLLs failing to be found will be printed to console

const fs = require('fs');
const childProcess = require('child_process');
const path = require('path');

/**
 * Dependencies 的路径，该脚本使用 Dependencies 获取可执行文件的依赖
 * path to Dependencies' executable file, this script use Dependencies to collect dependencies
 */
const DEPENDENCIES_PATH = 'D:/Program Files/Dependencies_x64_Release_.without.peview.exe/Dependencies.exe';

/**
 * 需要收集依赖的可执行文件
 * path to the executable whose dependencies need to be collected
 */
const EXE_PATH = './QtVtk1.exe';

const EXE_DIR_PATH = path.dirname(EXE_PATH);

/**
 * 搜索 dll 文件的目录
 * directories searching for missing dll
 */
const SEARCH_DIRS = [
  'D:/sdk/vtk-9.3.0.rc1-install/bin',
];

/**
 * 过滤 dll 文件的正则表达式
 * a regular expression used to filter DLLs
 */
const INCLUDE_PATTERN = /^vtk/;

/**
 * 使用 INCLUDE_PATTERN 过滤符合条件的 dll 文件
 * result will be filtered with INCLUDE_PATTERN
 * @param {string} targetPath
 *  指定的 exe 文件或者 dll 文件
 *  path to an exe or dll
 * @returns {Map<string, string | null>}
 *  指定文件依赖的其他 dll 文件的名称到路径的映射
 *  map from DLL's name to file path
 */
function scan(targetPath) {
  const result = new Map();
  const json = JSON.parse(childProcess.execSync(`"${DEPENDENCIES_PATH}" -json -depth 1 -chain "${targetPath}"`).toString('utf-8'));
  for (const dep of json.Root.Dependencies) {
    const moduleName = dep.ModuleName;
    const filePath = dep.Filepath;
    if (INCLUDE_PATTERN.test(moduleName)) {
      result.set(moduleName, filePath);
    }
  }
  return result;
}

/**
 * 待处理文件列表，包含：
 * 1. 已经存在的 dll （这个 dll 是 exe 文件直接/间接依赖的，并且已经存在于 exe 文件旁边）
 * 2. 尚未存在的 dll （这个 dll 是 exe 文件直接/间接依赖的，并且尚未存在于 exe 文件旁边）
 * 
 * files waiting to be processed:
 * 1. DLLs already existed (direct or indirect dependencies, already existed in exe's directory)
 * 2. DLLS not exist (direct or indirect dependencies, currently no exist in exe's directory)
 */
let queue = scan(EXE_PATH);

const startTime = new Date().getTime();

while (queue.size) {
  for (const pair of queue) {
    const moduleName = pair[0];
    const filePath = pair[1];
    let populateFilePath;
    if (filePath) {
      // filePath 不为空意味着该 dll 已经存在于 exe 文件旁边
      // a non-null filePath means this DLL is already existed
      queue.delete(moduleName);
      populateFilePath = filePath;
    } else {
      let foundFileName;
      let foundDir;
      for (const searchDir of SEARCH_DIRS) {
        const files = fs.readdirSync(searchDir);
        const file = files.find(f => f === moduleName);
        if (file) {
          foundFileName = file;
          foundDir = searchDir;
          break;
        }
      }
      if (foundFileName) {
        const src = path.join(foundDir, foundFileName);
        const dest = path.join(EXE_DIR_PATH, moduleName);
        console.log(`Copying ${foundFileName}...`);
        fs.copyFileSync(src, dest);
        queue.delete(moduleName);
        populateFilePath = dest;
      } else {
        throw new Error('Can not find ' + moduleName);
      }
    }

    // 循环终止条件：最终 scan 返回的 map 会是空的
    // finally the map returned by scan() will be empty, and the loop will end
    const children = scan(populateFilePath);
    for (const childPair of children) {
      const childModuleName = childPair[0];
      const childFilePath = childPair[1];
      if (queue.has(childModuleName)) {
        continue;
      } else {
        queue.set(childModuleName, childFilePath);
      }
    }
  }
}

const endTime = new Date().getTime();

console.log(`Cost time ${Math.round((endTime - startTime) / 1000)} sec`);
