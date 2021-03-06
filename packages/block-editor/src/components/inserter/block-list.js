/**
 * External dependencies
 */
import {
	map,
	includes,
	filter,
	findIndex,
	flow,
	sortBy,
	groupBy,
	isEmpty,
} from 'lodash';

/**
 * WordPress dependencies
 */
import { __, _x, _n, sprintf } from '@wordpress/i18n';
import { withSpokenMessages } from '@wordpress/components';
import { addQueryArgs } from '@wordpress/url';
import { controlsRepeat } from '@wordpress/icons';
import { speak } from '@wordpress/a11y';
import { createBlock } from '@wordpress/blocks';
import { useMemo, useEffect } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { compose } from '@wordpress/compose';

/**
 * Internal dependencies
 */
import BlockTypesList from '../block-types-list';
import ChildBlocks from './child-blocks';
import __experimentalInserterMenuExtension from '../inserter-menu-extension';
import { searchBlockItems } from './search-items';
import InserterPanel from './panel';
import InserterNoResults from './no-results';

// Copied over from the Columns block. It seems like it should become part of public API.
const createBlocksFromInnerBlocksTemplate = ( innerBlocksTemplate ) => {
	return map(
		innerBlocksTemplate,
		( [ name, attributes, innerBlocks = [] ] ) =>
			createBlock(
				name,
				attributes,
				createBlocksFromInnerBlocksTemplate( innerBlocks )
			)
	);
};

const getBlockNamespace = ( item ) => item.name.split( '/' )[ 0 ];

const MAX_SUGGESTED_ITEMS = 9;

export function InserterBlockList( {
	rootClientId,
	onInsert,
	onHover,
	__experimentalSelectBlockOnInsert: selectBlockOnInsert,
	filterValue,
	debouncedSpeak,
} ) {
	const {
		categories,
		collections,
		items,
		rootChildBlocks,
		fetchReusableBlocks,
	} = useSelect(
		( select ) => {
			const { getInserterItems, getBlockName, getSettings } = select(
				'core/block-editor'
			);
			const {
				getCategories,
				getCollections,
				getChildBlockNames,
			} = select( 'core/blocks' );
			const rootBlockName = getBlockName( rootClientId );
			const { __experimentalFetchReusableBlocks } = getSettings();

			return {
				categories: getCategories(),
				collections: getCollections(),
				rootChildBlocks: getChildBlockNames( rootBlockName ),
				items: getInserterItems( rootClientId ),
				fetchReusableBlocks: __experimentalFetchReusableBlocks,
			};
		},
		[ rootClientId ]
	);

	// Fetch resuable blocks on mount
	useEffect( () => {
		if ( fetchReusableBlocks ) {
			fetchReusableBlocks();
		}
	}, [] );

	const onSelectItem = ( item ) => {
		const { name, title, initialAttributes, innerBlocks } = item;
		const insertedBlock = createBlock(
			name,
			initialAttributes,
			createBlocksFromInnerBlocksTemplate( innerBlocks )
		);

		onInsert( insertedBlock );

		if ( ! selectBlockOnInsert ) {
			// translators: %s: the name of the block that has been added
			const message = sprintf( __( '%s block added' ), title );
			speak( message );
		}
	};

	const filteredItems = useMemo( () => {
		return searchBlockItems( items, categories, collections, filterValue );
	}, [ filterValue, items, categories, collections ] );

	const childItems = useMemo( () => {
		return filter( filteredItems, ( { name } ) =>
			includes( rootChildBlocks, name )
		);
	}, [ filteredItems, rootChildBlocks ] );

	const suggestedItems = useMemo( () => {
		return filter( items, ( item ) => item.utility > 0 ).slice(
			0,
			MAX_SUGGESTED_ITEMS
		);
	}, [ items ] );

	const reusableItems = useMemo( () => {
		return filter( filteredItems, { category: 'reusable' } );
	}, [ filteredItems ] );

	const itemsPerCategory = useMemo( () => {
		const getCategoryIndex = ( item ) => {
			return findIndex(
				categories,
				( category ) => category.slug === item.category
			);
		};

		return flow(
			( itemList ) =>
				filter( itemList, ( item ) => item.category !== 'reusable' ),
			( itemList ) => sortBy( itemList, getCategoryIndex ),
			( itemList ) => groupBy( itemList, 'category' )
		)( filteredItems );
	}, [ filteredItems, categories ] );

	const itemsPerCollection = useMemo( () => {
		// Create a new Object to avoid mutating collection
		const result = { ...collections };
		Object.keys( collections ).forEach( ( namespace ) => {
			result[ namespace ] = filteredItems.filter(
				( item ) => getBlockNamespace( item ) === namespace
			);
			if ( result[ namespace ].length === 0 ) {
				delete result[ namespace ];
			}
		} );

		return result;
	}, [ filteredItems, collections ] );

	// Announce search results on change
	useEffect( () => {
		const resultsFoundMessage = sprintf(
			/* translators: %d: number of results. */
			_n( '%d result found.', '%d results found.', filteredItems.length ),
			filteredItems.length
		);
		debouncedSpeak( resultsFoundMessage );
	}, [ filterValue, debouncedSpeak ] );

	const hasItems = ! isEmpty( filteredItems );
	const hasChildItems = childItems.length > 0;

	return (
		<div>
			<ChildBlocks
				rootClientId={ rootClientId }
				items={ childItems }
				onSelect={ onSelectItem }
				onHover={ onHover }
			/>

			{ ! hasChildItems && !! suggestedItems.length && ! filterValue && (
				<InserterPanel title={ _x( 'Most used', 'blocks' ) }>
					<BlockTypesList
						items={ suggestedItems }
						onSelect={ onSelectItem }
						onHover={ onHover }
					/>
				</InserterPanel>
			) }

			{ ! hasChildItems &&
				map( categories, ( category ) => {
					const categoryItems = itemsPerCategory[ category.slug ];
					if ( ! categoryItems || ! categoryItems.length ) {
						return null;
					}
					return (
						<InserterPanel
							key={ category.slug }
							title={ category.title }
							icon={ category.icon }
						>
							<BlockTypesList
								items={ categoryItems }
								onSelect={ onSelectItem }
								onHover={ onHover }
							/>
						</InserterPanel>
					);
				} ) }

			{ ! hasChildItems &&
				map( collections, ( collection, namespace ) => {
					const collectionItems = itemsPerCollection[ namespace ];
					if ( ! collectionItems || ! collectionItems.length ) {
						return null;
					}

					return (
						<InserterPanel
							key={ namespace }
							title={ collection.title }
							icon={ collection.icon }
						>
							<BlockTypesList
								items={ collectionItems }
								onSelect={ onSelectItem }
								onHover={ onHover }
							/>
						</InserterPanel>
					);
				} ) }

			{ ! hasChildItems && !! reusableItems.length && (
				<InserterPanel
					className="block-editor-inserter__reusable-blocks-panel"
					title={ __( 'Reusable' ) }
					icon={ controlsRepeat }
				>
					<BlockTypesList
						items={ reusableItems }
						onSelect={ onSelectItem }
						onHover={ onHover }
					/>
					<a
						className="block-editor-inserter__manage-reusable-blocks"
						href={ addQueryArgs( 'edit.php', {
							post_type: 'wp_block',
						} ) }
					>
						{ __( 'Manage all reusable blocks' ) }
					</a>
				</InserterPanel>
			) }

			<__experimentalInserterMenuExtension.Slot
				fillProps={ {
					onSelect: onSelectItem,
					onHover,
					filterValue,
					hasItems,
				} }
			>
				{ ( fills ) => {
					if ( fills.length ) {
						return fills;
					}
					if ( ! hasItems ) {
						return <InserterNoResults />;
					}
					return null;
				} }
			</__experimentalInserterMenuExtension.Slot>
		</div>
	);
}

export default compose( withSpokenMessages )( InserterBlockList );
