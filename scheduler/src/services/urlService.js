const replaceApiUrlPrefix = (baseUrl, blApiUrl) => {
  // Skip ReportViewer URLs entirely
  if (baseUrl.includes("/ReportViewer/")) {
    console.log(`Using original ReportViewer URL: ${baseUrl}`);
    return baseUrl;
  }

  if (!blApiUrl || !baseUrl) {
    console.log(`Using original API URL: ${baseUrl}`);
    return baseUrl;
  }
  // Clean blApiUrl before using
  const cleanedBlApiUrl = String(blApiUrl).replace(/[`\s]/g, "");

  // For all other URLs (API endpoints)
  const prefixPattern = /^https?:\/\/[^/]+\/DCCLogisticsSuite\/[^/]+/;
  const dynamicUrl = baseUrl.replace(prefixPattern, cleanedBlApiUrl);

  console.log(`Dynamic API URL generated:`, {
    original: baseUrl,
    new: dynamicUrl,
  });
  return dynamicUrl;
};

const fetchDomainData = async (dbName) => {
  console.log("fetchDomainData called with dbName:", dbName);
  try {
    const url = `https://logsuitedomainverify.dcctz.com/api/get_domain_url?DBName=${dbName}`;
    console.log("Calling domain API:", url);
    const domainResponse = await fetch(url);
    console.log("Domain API response status:", domainResponse.status);
    if (domainResponse.ok) {
      const data = await domainResponse.json();
      console.log(
        "Domain API response data (raw):",
        JSON.stringify(data, null, 2),
      );
      // Clean up any extra backticks and whitespace
      const cleanedData = {
        ...data,
        url: data.url ? String(data.url).replace(/[`\s]/g, "") : data.url,
        BLApiUrl: data.BLApiUrl
          ? String(data.BLApiUrl).replace(/[`\s]/g, "")
          : data.BLApiUrl,
      };
      console.log(
        "Domain API response data (cleaned):",
        JSON.stringify(cleanedData, null, 2),
      );
      return cleanedData;
    }
    const responseText = await domainResponse.text();
    console.warn("Domain API not ok:", responseText);
    return null;
  } catch (err) {
    console.warn("Error fetching domain data:", err.message);
    console.warn("Error stack:", err.stack);
    return null;
  }
};

module.exports = {
  replaceApiUrlPrefix,
  fetchDomainData,
};
