#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { delimiter, dirname, extname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const projectRoot = process.cwd()

function pathEntries() {
  return (process.env.PATH || '').split(delimiter).filter(Boolean)
}

function prependPath(dir) {
  if (!dir || !existsSync(dir)) return
  const normalized = resolve(dir).toLowerCase()
  const hasPath = pathEntries().some((entry) => resolve(entry).toLowerCase() === normalized)
  if (!hasPath) {
    process.env.PATH = `${dir}${delimiter}${process.env.PATH || ''}`
  }
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where.exe' : 'command'
  const args = process.platform === 'win32' ? [command] : ['-v', command]
  const result = spawnSync(probe, args, { env: process.env, stdio: 'ignore', shell: process.platform !== 'win32' })
  return result.status === 0
}

function ensureCargoPath() {
  if (commandExists('cargo')) return

  const candidates = [
    process.env.CARGO_HOME && join(process.env.CARGO_HOME, 'bin'),
    process.env.USERPROFILE && join(process.env.USERPROFILE, '.cargo', 'bin'),
    process.env.HOME && join(process.env.HOME, '.cargo', 'bin'),
  ].filter(Boolean)

  for (const dir of candidates) {
    const cargo = join(dir, process.platform === 'win32' ? 'cargo.exe' : 'cargo')
    if (existsSync(cargo)) {
      prependPath(dir)
      return
    }
  }
}

function copyIfMissingOrDifferent(source, target) {
  if (!existsSync(source)) return false

  const shouldCopy = !existsSync(target) || statSync(source).size !== statSync(target).size
  if (!shouldCopy) return false

  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  return true
}

function ensureRolldownWindowsFallback(root) {
  if (process.platform !== 'win32' || process.arch !== 'x64') return

  const msvcBinding = [
    join(root, 'node_modules', '@rolldown', 'binding-win32-x64-msvc', 'rolldown-binding.win32-x64-msvc.node'),
    join(
      root,
      'node_modules',
      'rolldown',
      'node_modules',
      '@rolldown',
      'binding-win32-x64-msvc',
      'rolldown-binding.win32-x64-msvc.node',
    ),
  ].find((candidate) => existsSync(candidate))

  if (!msvcBinding) return

  const sharedDir = join(root, 'node_modules', 'rolldown', 'dist', 'shared')
  copyIfMissingOrDifferent(msvcBinding, join(sharedDir, 'rolldown-binding.win32-x64-msvc.node'))
  copyIfMissingOrDifferent(msvcBinding, join(sharedDir, 'rolldown-binding.win32-x64-gnu.node'))
}

function parseArgs(argv) {
  const command = []

  for (const arg of argv) {
    if (arg.startsWith('--webui-target=')) {
      process.env.WEBUI_DEV_TARGET = arg.slice('--webui-target='.length)
      continue
    }
    command.push(arg)
  }

  return command
}

function resolveCommand(command) {
  if (process.platform !== 'win32') return command
  if (extname(command)) return command

  const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.toLowerCase())

  for (const dir of pathEntries()) {
    for (const extension of extensions) {
      const candidate = join(dir, `${command}${extension}`)
      if (existsSync(candidate)) return candidate
    }
  }

  return command
}

function commandInvocation(command, args) {
  const resolved = resolveCommand(command)
  const extension = extname(resolved).toLowerCase()

  if (process.platform === 'win32' && (extension === '.cmd' || extension === '.bat')) {
    const shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
    return { command: shell, args: ['/d', '/c', resolved, ...args] }
  }

  return { command: resolved, args }
}

prependPath(join(projectRoot, 'node_modules', '.bin'))
ensureCargoPath()
ensureRolldownWindowsFallback(projectRoot)

const command = parseArgs(process.argv.slice(2))

if (command.length === 0) {
  process.exit(0)
}

const invocation = commandInvocation(command[0], command.slice(1))

const child = spawn(invocation.command, invocation.args, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
