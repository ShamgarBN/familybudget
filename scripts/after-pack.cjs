const { execFileSync } = require('node:child_process')
const path = require('node:path')

/**
 * Apple Silicon builds need a signed app bundle. Without at least an ad-hoc
 * signature, macOS can report the app as "damaged" instead of offering the
 * friendlier unidentified-developer prompt.
 *
 * This does not notarize the app or require a paid Apple Developer account.
 * It only makes the local bundle structurally valid for Gatekeeper.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)

  execFileSync(
    '/usr/bin/codesign',
    ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
    { stdio: 'inherit' },
  )

  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--verbose=2', appPath], {
    stdio: 'inherit',
  })
}
