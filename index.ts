import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as documentdb from "@pulumi/azure-native/documentdb";
import * as storage from "@pulumi/azure-native/storage";
import * as web from "@pulumi/azure-native/web";
import * as insights from "@pulumi/azure-native/insights";

// General Configuration
const config = new pulumi.Config();
const configRG = config.require("resourceGroupName");
const configLocation = config.require("location");  // EastUS, WestUS etc.
// Database Configuration
const configDBAccountName = config.require("cosmosAccountName");
const configDBName = config.require("cosmosDBName");
// Storage Configuration
const configStorageName = config.require("storageName");
const configStorageKind = config.require("storageKind");
const configStorageSKU = config.require("storageSKU");
// WebApp Service Configuration
const configAppServiceName = config.require("appServiceName");
const configAppServiceKind = config.require("appServiceKind");
const configAppServiceSKUName = config.require("appServiceSKUName");
const configAppServiceSKUTier = config.require("appServiceSKUTier");
// WebApp App Insights Configuration
const configAppInsightsName = config.require("appInsightsName");
const configAppInsightsKind = config.require("appInsightsKind");
const configAppInsightsType = config.require("appInsightsType");
// WebApp Configuration
const configAppName = config.require("webAppName");
// Static Site Configuration
const configFrontEndName = config.require("frontEndName");

// Create an Azure Resource Group
var resourceGroup = new resources.ResourceGroup(configRG, { location: configLocation, resourceGroupName: configRG });

// Cosmos DB Account
var cosmosdbAccount = new documentdb.DatabaseAccount(configDBAccountName, {
    resourceGroupName: resourceGroup.name,
    databaseAccountOfferType: documentdb.DatabaseAccountOfferType.Standard,
    locations: [{
        locationName: configLocation,
        failoverPriority: 0,
    }],
    consistencyPolicy: {
        defaultConsistencyLevel: documentdb.DefaultConsistencyLevel.Session,
    },
});

// Cosmos DB Database
var cosmosdbDatabase = new documentdb.SqlResourceSqlDatabase(configDBName, {
    resourceGroupName: resourceGroup.name,
    accountName: cosmosdbAccount.name,
    resource: {
        id: configDBName,
    },
});

// Storage Account
var storageAccount = new storage.StorageAccount(configStorageName, {
    resourceGroupName: resourceGroup.name,
    kind: configStorageKind,
    sku: {
        name: configStorageSKU,
    },
});

// WebApp Service Plan
var appServicePlan = new web.AppServicePlan(configAppServiceName, {
    resourceGroupName: resourceGroup.name,
    kind: configAppServiceKind,
    sku: {
        name: configAppServiceSKUName,
        tier: configAppServiceSKUTier,
    },
});

// App Insights for the Web App
var appInsights = new insights.Component(configAppInsightsName, {
    resourceGroupName: resourceGroup.name,
    kind: configAppInsightsKind,
    applicationType: configAppInsightsType,
});

var comosdbDonnectionString = cosmosdbAccount.documentEndpoint;

// Web App
var webApp = new web.WebApp(configAppName, {
    resourceGroupName: resourceGroup.name,
    serverFarmId: appServicePlan.id,
    siteConfig: {
        appSettings: [
            {
                name: "APPINSIGHTS_INSTRUMENTATIONKEY",
                value: appInsights.instrumentationKey,
            },
            {
                name: "APPLICATIONINSIGHTS_CONNECTION_STRING",
                value: pulumi.interpolate`InstrumentationKey=${appInsights.instrumentationKey}`,
            },
            {
                name: "ApplicationInsightsAgent_EXTENSION_VERSION",
                value: "~2",
            }
        ],
        connectionStrings: [{
            name: "db",
            connectionString: comosdbDonnectionString,
            type: web.ConnectionStringType.DocDb
        }],
    },
});

// Enable static website support
var staticWebsite = new storage.StorageAccountStaticWebsite(configFrontEndName, {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    indexDocument: "index.html",
    error404Document: "404.html",
});

// Upload Web Files
["index.html", "404.html"].map(name =>
    new storage.Blob(name, {
        resourceGroupName: resourceGroup.name,
        accountName: storageAccount.name,
        containerName: staticWebsite.containerName,
        source: new pulumi.asset.FileAsset(`./websrc/${name}`),
        contentType: "text/html",
    }),
);

// Web endpoint to the website
export const staticEndpoint = storageAccount.primaryEndpoints.web;