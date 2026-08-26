const replaceApiUrlPrefix = (baseUrl, blApiUrl) => {
  if (baseUrl.includes("/ReportViewer/")) {
    console.log(`Using original ReportViewer URL: ${baseUrl}`);
    return baseUrl;
  }

  if (!blApiUrl || !baseUrl) {
    console.log(`Using original API URL: ${baseUrl}`);
    return baseUrl;
  }
  const cleanedBlApiUrl = String(blApiUrl).replace(/[`\s]/g, "");

  const prefixPattern = /^https?:\/\/[^/]+\/DCCLogisticsSuite\/[^/]+/;
  const dynamicUrl = baseUrl.replace(prefixPattern, cleanedBlApiUrl);

  console.log(`Dynamic API URL generated:`, {
    original: baseUrl,
    new: dynamicUrl,
  });
  return dynamicUrl;
};

const domainCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const fetchDomainData = async (dbName) => {
  console.log("fetchDomainData called with dbName:", dbName);
  if (!dbName) return null;

  const cached = domainCache.get(dbName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log("fetchDomainData returning cached result for dbName:", dbName);
    return cached.data;
  }

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
      domainCache.set(dbName, { data: cleanedData, timestamp: Date.now() });
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
