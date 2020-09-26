const fs = require("fs");
const yaml = require("js-yaml");

const config = {
  kovan: {
    v1FactoryAddress: "0x0C60Cd59f42093c7489BA68BAA4d7A01f2468153",
    v1FactoryStartBlock: 14980875,
    v2FactoryAddress: "0xB47778d3BcCBf5e39dEC075CA5F185fc20567b1e",
    v2FactoryStartBlock: 16845360,
  },
  rinkeby: {
    v1FactoryAddress: "0x610247467d0dfA8B477ad7Dd1644e86CB2a79F8F",
    v1FactoryStartBlock: 6494343,
    v2FactoryAddress: "0x763b61A62EF076ad960E1d513713B2aeD7C1b88e",
    v2FactoryStartBlock: 6494329,
  },
  xdai: {
    v1FactoryAddress: "0x9232DeA84E91b49feF6b604EEA0455692FC27Ba8",
    v1FactoryStartBlock: 10733005,
    v2FactoryAddress: "0x124F707B3675b5fdd6208F4483C5B6a0B9bAf316",
    v2FactoryStartBlock: 10733005,
  },
  mainnet: {
    v1FactoryAddress: "0x2840d12d926cc686217bb42b80b662c7d72ee787",
    v1FactoryStartBlock: 8625240,
    v2FactoryAddress: "0x1782a13f176e84Be200842Ade79daAA0B09F0418",
    v2FactoryStartBlock: 9484660,
  },
  idchain: {
    v1FactoryAddress: "0xb29f7eEc3d6d3B614fd458094f7e2Ebb3488E12D",
    v1FactoryStartBlock: 2199947,
    v2FactoryAddress: "0xF42aFC058B7b6f80729e43021404549F69875652",
    v2FactoryStartBlock: 2200328,
  },
};

const network = process.argv.slice(2)[0];

try {
  let fileContents = fs.readFileSync("./subgraph-template.yaml", "utf8");
  let data = yaml.safeLoad(fileContents);

  data.dataSources[0].network = network;
  data.dataSources[0].source.address = config[network].v1FactoryAddress;
  data.dataSources[0].source.startBlock = config[network].v1FactoryStartBlock;

  data.dataSources[1].network = network;
  data.dataSources[1].source.address = config[network].v2FactoryAddress;
  data.dataSources[1].source.startBlock = config[network].v2FactoryStartBlock;

  data.templates[0].network = network;
  data.templates[1].network = network;

  if (network !== "mainnet") {
    data.dataSources.splice(2, 1);
  }

  let yamlStr = yaml.safeDump(data);
  fs.writeFileSync("subgraph.yaml", yamlStr, "utf8");

  console.log("Generated subgraph.yaml for " + network);
} catch (e) {
  console.log(e);
}
