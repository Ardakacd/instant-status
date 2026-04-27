const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const START_MARKER = "# >>> withFmtFix";
const END_MARKER = "# <<< withFmtFix";
const RUBY_PATCH = `${START_MARKER}
    fmt_cpp_flags = ['-DFMT_USE_CONSTEXPR=0', '-DFMT_USE_CONSTEVAL=0', '-Wno-invalid-constexpr']
    fmt_defines = ['FMT_USE_CONSTEXPR=0', 'FMT_USE_CONSTEVAL=0']

    apply_fmt_defines = lambda do |build_settings|
      existing_cpp = build_settings['OTHER_CPLUSPLUSFLAGS']
      cpp_flags =
        case existing_cpp
        when nil
          ['$(inherited)']
        when String
          [existing_cpp]
        else
          existing_cpp
        end

      fmt_cpp_flags.each do |flag|
        unless cpp_flags.include?(flag)
          cpp_flags << flag
        end
      end

      build_settings['OTHER_CPLUSPLUSFLAGS'] = cpp_flags

      existing_defs = build_settings['GCC_PREPROCESSOR_DEFINITIONS']
      defs =
        case existing_defs
        when nil
          ['$(inherited)']
        when String
          [existing_defs]
        else
          existing_defs
        end

      fmt_defines.each do |definition|
        unless defs.include?(definition)
          defs << definition
        end
      end

      build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
    end

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        apply_fmt_defines.call(config.build_settings)
      end
    end

    updated_projects = {}
    installer.aggregate_targets.each do |aggregate_target|
      user_project = aggregate_target.user_project
      aggregate_target.user_targets.each do |user_target|
        user_target.build_configurations.each do |config|
          apply_fmt_defines.call(config.build_settings)
        end
      end
      updated_projects[user_project.path.to_s] = user_project
    end

    updated_projects.each_value(&:save)

    # Ensure fmt honors externally forced FMT_USE_CONSTEVAL in C++20 builds.
    fmt_base_h = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_h)
      base_h_contents = File.read(fmt_base_h)
      unless base_h_contents.include?('#if defined(FMT_USE_CONSTEVAL)')
        base_h_contents = base_h_contents.sub(
          '#if !defined(__cpp_lib_is_constant_evaluated)',
          "#if defined(FMT_USE_CONSTEVAL)\n// Use the provided definition.\n#elif !defined(__cpp_lib_is_constant_evaluated)"
        )
        File.write(fmt_base_h, base_h_contents)
      end
    end
${END_MARKER}`;

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfilePath, "utf-8");

      const blockRegex = new RegExp(
        `${START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
        "g"
      );
      contents = contents.replace(blockRegex, "");

      if (contents.includes("# Fix: folly/coro/Coroutine.h file not found")) {
        contents = contents.replace(
          /(\s*)# Fix: folly\/coro\/Coroutine\.h file not found \(RN 0\.74\+\)/,
          `$1${RUBY_PATCH}\n$1# Fix: folly/coro/Coroutine.h file not found (RN 0.74+)`
        );
      } else if (contents.includes("react_native_post_install(")) {
        contents = contents.replace(
          /(\s*)react_native_post_install\([\s\S]*?\n\1\)/,
          (match) => `${match}\n\n${RUBY_PATCH}`
        );
      } else {
        contents = contents.replace(/post_install do \|installer\|/, `post_install do |installer|\n${RUBY_PATCH}`);
      }

      fs.writeFileSync(podfilePath, contents);
      return modConfig;
    },
  ]);
};
