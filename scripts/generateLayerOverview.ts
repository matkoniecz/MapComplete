import ScriptUtils from "./ScriptUtils";
import {writeFileSync} from "fs";
import * as licenses from "../assets/generated/license_info.json"
import {LayoutConfigJson} from "../Models/ThemeConfig/Json/LayoutConfigJson";
import LayoutConfig from "../Models/ThemeConfig/LayoutConfig";
import {LayerConfigJson} from "../Models/ThemeConfig/Json/LayerConfigJson";
import LayerConfig from "../Models/ThemeConfig/LayerConfig";
import {Translation} from "../UI/i18n/Translation";
import {Utils} from "../Utils";

// This scripts scans 'assets/layers/*.json' for layer definition files and 'assets/themes/*.json' for theme definition files.
// It spits out an overview of those to be used to load them

interface LayersAndThemes {
    themes: LayoutConfigJson[],
    layers: { parsed: LayerConfigJson, path: string }[]
}


class LayerOverviewUtils {

    loadThemesAndLayers(): LayersAndThemes {

        const layerFiles = ScriptUtils.getLayerFiles();

        const themeFiles: LayoutConfigJson[] = ScriptUtils.getThemeFiles().map(x => x.parsed);

        console.log("Discovered", layerFiles.length, "layers and", themeFiles.length, "themes\n")
        if (layerFiles.length + themeFiles.length === 0) {
            throw "Panic: no themes and layers loaded!"
        }
        return {
            layers: layerFiles,
            themes: themeFiles
        }
    }

    writeFiles(lt: LayersAndThemes) {
        writeFileSync("./assets/generated/known_layers_and_themes.json", JSON.stringify({
            "layers": lt.layers.map(l => l.parsed),
            "themes": lt.themes
        }))
    }

    validateLayer(layerJson: LayerConfigJson, path: string, knownPaths: Set<string>, context?: string): string[] {
        let errorCount = [];
        if (layerJson["overpassTags"] !== undefined) {
            errorCount.push("Layer " + layerJson.id + "still uses the old 'overpassTags'-format. Please use \"source\": {\"osmTags\": <tags>}' instead of \"overpassTags\": <tags> (note: this isn't your fault, the custom theme generator still spits out the old format)")
        }
        const forbiddenTopLevel = ["icon","wayHandling","roamingRenderings","roamingRendering","label","width","color","colour","iconOverlays"]
        for (const forbiddenKey of forbiddenTopLevel) {
            if(layerJson[forbiddenKey] !== undefined)
            errorCount.push("Layer "+layerJson.id+" still has a forbidden key "+forbiddenKey)
        }
        try {
            const layer = new LayerConfig(layerJson, "test", true)
            const images = Array.from(layer.ExtractImages())
            const remoteImages = images.filter(img => img.indexOf("http") == 0)
            for (const remoteImage of remoteImages) {
                errorCount.push("Found a remote image: " + remoteImage + " in layer " + layer.id + ", please download it. You can use the fixTheme script to automate this")
            }
            const expected: string = `assets/layers/${layer.id}/${layer.id}.json`
            if (path != undefined && path.indexOf(expected) < 0) {
                errorCount.push("Layer is in an incorrect place. The path is " + path + ", but expected " + expected)
            }
            if (layerJson["hideUnderlayingFeaturesMinPercentage"] !== undefined) {
                errorCount.push("Layer " + layer.id + " contains an old 'hideUnderlayingFeaturesMinPercentage'")
            }


            for (const image of images) {
                if (image.indexOf("{") >= 0) {
                    console.warn("Ignoring image with { in the path: ", image)
                    continue
                }

                if (!knownPaths.has(image)) {
                    const ctx = context === undefined ? "" : ` in a layer defined in the theme ${context}`
                    errorCount.push(`Image with path ${image} not found or not attributed; it is used in ${layer.id}${ctx}`)
                }
            }

        } catch (e) {
            console.error(e)
            return [`Layer ${layerJson.id}` ?? JSON.stringify(layerJson).substring(0, 50) + " is invalid: " + e]
        }
        return errorCount
    }

    main(args: string[]) {

        const layerFiles = ScriptUtils.getLayerFiles();
        const themeFiles = ScriptUtils.getThemeFiles();


        console.log("   ---------- VALIDATING ---------")
        const licensePaths = []
        for (const i in licenses) {
            licensePaths.push(licenses[i].path)
        }
        const knownPaths = new Set<string>(licensePaths)

        let layerErrorCount = []
        const knownLayerIds = new Map<string, LayerConfig>();
        for (const layerFile of layerFiles) {

            if (knownLayerIds.has(layerFile.parsed.id)) {
                throw "Duplicate identifier: " + layerFile.parsed.id + " in file " + layerFile.path
            }
            layerErrorCount.push(...this.validateLayer(layerFile.parsed, layerFile.path, knownPaths))
            knownLayerIds.set(layerFile.parsed.id, new LayerConfig(layerFile.parsed))
        }

        let themeErrorCount = []
        // used only for the reports
        let themeConfigs: LayoutConfig[] = []
        for (const themeInfo of themeFiles) {
            const themeFile = themeInfo.parsed
            const themePath = themeInfo.path
            if (typeof themeFile.language === "string") {
                themeErrorCount.push("The theme " + themeFile.id + " has a string as language. Please use a list of strings")
            }
            if (themeFile["units"] !== undefined) {
                themeErrorCount.push("The theme " + themeFile.id + " has units defined - these should be defined on the layer instead. (Hint: use overrideAll: { '+units': ... }) ")
            }
            if (themeFile["roamingRenderings"] !== undefined) {
                themeErrorCount.push("Theme " + themeFile.id + " contains an old 'roamingRenderings'. Use an 'overrideAll' instead")
            }
            for (const layer of themeFile.layers) {
                if (typeof layer === "string") {
                    if (!knownLayerIds.has(layer)) {
                        themeErrorCount.push(`Unknown layer id: ${layer} in theme ${themeFile.id}`)
                    }
                } else if (layer["builtin"] !== undefined) {
                    let names = layer["builtin"];
                    if (typeof names === "string") {
                        names = [names]
                    }
                    names.forEach(name => {
                        if (!knownLayerIds.has(name)) {
                            themeErrorCount.push("Unknown layer id: " + name + "(which uses inheritance)")
                        }
                        return
                    })
                } else {
                    layerErrorCount.push(...this.validateLayer(<LayerConfigJson>layer, undefined, knownPaths, themeFile.id))
                    if (knownLayerIds.has(layer["id"])) {
                        throw `The theme ${themeFile.id} defines a layer with id ${layer["id"]}, which is the same as an already existing layer`
                    }
                }
            }

            const referencedLayers = Utils.NoNull([].concat(...themeFile.layers.map(layer => {
                if (typeof layer === "string") {
                    return layer
                }
                if (layer["builtin"] !== undefined) {
                    return layer["builtin"]
                }
                return undefined
            }).map(layerName => {
                if (typeof layerName === "string") {
                    return [layerName]
                }
                return layerName
            })))

            themeFile.layers = themeFile.layers
                .filter(l => typeof l != "string") // We remove all the builtin layer references as they don't work with ts-node for some weird reason
                .filter(l => l["builtin"] === undefined)


            try {
                const theme = new LayoutConfig(themeFile, true, "test")
                if (theme.id !== theme.id.toLowerCase()) {
                    themeErrorCount.push("Theme ids should be in lowercase, but it is " + theme.id)
                }
                let filename = themePath.substring(themePath.lastIndexOf("/") + 1, themePath.length - 5)
                if (theme.id !== filename) {
                    themeErrorCount.push("Theme ids should be the same as the name.json, but we got id: " + theme.id + " and filename " + filename + " (" + themePath + ")")
                }
                const neededLanguages = themeFile["mustHaveLanguage"]
                if (neededLanguages !== undefined) {
                    console.log("Checking language requirements for ", theme.id, "as it must have", neededLanguages.join(", "))
                    const allTranslations = [].concat(Translation.ExtractAllTranslationsFrom(theme, theme.id),
                        ...referencedLayers.map(layerId => Translation.ExtractAllTranslationsFrom(knownLayerIds.get(layerId), theme.id + "->" + layerId)))
                    for (const neededLanguage of neededLanguages) {
                        allTranslations
                            .filter(t => t.tr.translations[neededLanguage] === undefined && t.tr.translations["*"] === undefined)
                            .forEach(missing => {
                                themeErrorCount.push("The theme " + theme.id + " should be translation-complete for " + neededLanguage + ", but it lacks a translation for " + missing.context)
                            })
                    }


                }
                themeConfigs.push(theme)
            } catch (e) {
                themeErrorCount.push("Could not parse theme " + themeFile["id"] + "due to", e)
            }
        }

        if (layerErrorCount.length + themeErrorCount.length == 0) {
            console.log("All good!")

            // We load again from disc, as modifications were made above
            const lt = this.loadThemesAndLayers();
            this.writeFiles(lt);
        } else {
            const errors = layerErrorCount.concat(themeErrorCount).join("\n")
            console.log(errors)
            const msg = (`Found ${layerErrorCount.length} errors in the layers; ${themeErrorCount.length} errors in the themes`)
            console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

            console.log(msg)
            console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

            if (args.indexOf("--report") >= 0) {
                console.log("Writing report!")
                writeFileSync("layer_report.txt", errors)
            }
            if (args.indexOf("--no-fail") < 0) {
                throw msg;
            }
        }
    }
}

new LayerOverviewUtils().main(process.argv)
