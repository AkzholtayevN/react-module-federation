import React, { useState } from "react";

import { NCALayerClient } from "../service/ncalayer-client";

const NCASignatureForm = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
  };

  const handleSignClick = async () => {
    try {
      const ncaClient = new NCALayerClient();
      await ncaClient.connect();

      const allowedStorages = NCALayerClient.basicsStorageAll;
      const format = "MTEK";
      const signingParams = NCALayerClient.basicsCMSParams;
      const signerParams = NCALayerClient.basicsSignerAny;

      const signature = await ncaClient.basicsSignCMS(
        allowedStorages,
        selectedFile,
        signingParams,
        signerParams
      );
      setIsSigned(true);
      setIsError(false);
      console.log("Signature:", signature);
    } catch (error) {
      console.error("Error signing file:", error);
      setIsError(true);
      setIsSigned(false);
    }
  };

  return (
    <div>
      <h2>Подписание файла с использованием NCALayer</h2>
      <form>
        <input type="file" onChange={handleFileChange} />
      </form>
      {selectedFile && (
        <button onClick={handleSignClick}>Подписать файл</button>
      )}
      {isSigned && <p>Документ успешно подписан</p>}
      {isError && <p>Something went wrong, try again later</p>}
    </div>
  );
};

export default NCASignatureForm;
