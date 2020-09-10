import resolve from "@rollup/plugin-node-resolve";

export default {
  input: "./index.js",
  output: {
    file: "public/build/bundle.js",
    format: "esm",
    sourcemap: true,
  },
  plugins: [resolve()],
};
