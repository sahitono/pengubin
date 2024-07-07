import antfu from "@antfu/eslint-config"

export default antfu({
  typescript: true,
  formatters: true,
  jsx: true,
  rules: {
    "no-console": ["off"],
  },
  stylistic: {
    quotes: "double",
    indent: 2
  },
})
