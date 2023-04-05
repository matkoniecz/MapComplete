import { Store, UIEventSource } from "../UIEventSource"
import FilteredLayer from "../../Models/FilteredLayer"
import { BBox } from "../BBox"
import { Feature } from "geojson"

export interface FeatureSource {
    features: Store<Feature[]>
}
export interface WritableFeatureSource extends FeatureSource {
    features: UIEventSource<Feature[]>
}

export interface Tiled {
    tileIndex: number
    bbox: BBox
}

/**
 * A feature source which only contains features for the defined layer
 */
export interface FeatureSourceForLayer extends FeatureSource {
    readonly layer: FilteredLayer
}

/**
 * A feature source which is aware of the indexes it contains
 */
export interface IndexedFeatureSource extends FeatureSource {
    readonly featuresById: Store<Map<string, Feature>>
}
