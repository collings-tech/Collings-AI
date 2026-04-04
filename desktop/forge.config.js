module.exports = {
  packagerConfig: {
    asar: false,
    name: 'Collings AI',
    executableName: 'collings-ai',
    icon: './assets/images/collings-logo',
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'collings_ai',
        authors: 'Collings AI',
        description: 'WordPress management powered by AI',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
};
