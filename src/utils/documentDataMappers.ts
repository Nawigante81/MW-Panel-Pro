import { Client, Property, Agent } from '../types';

export type DocumentMapperInput = {
  client?: Client;
  property?: Property;
  agent?: Agent;
  agency: {
    name: string;
    nip?: string;
    address: string;
    phone: string;
    email: string;
    website?: string;
  };
  base: Record<string, string>;
};

export type DocumentPayload = Record<string, string>;

const empty = (value?: string | number | null) => (value === undefined || value === null ? '' : String(value));

export const mapDocumentPayload = ({ client, property, agent, agency, base }: DocumentMapperInput): DocumentPayload => {
  const address = property
    ? `${empty(property.address.street)} ${empty(property.address.buildingNumber)}${property.address.apartmentNumber ? `/${property.address.apartmentNumber}` : ''}, ${empty(property.address.city)}`.trim()
    : '';

  return {
    ...base,
    agency_name: agency.name,
    agency_nip: empty(agency.nip),
    agency_address: agency.address,
    agency_phone: agency.phone,
    agency_email: agency.email,
    agency_website: empty(agency.website),
    client_name: base.client_name || (client ? `Klient #${client.id.slice(0, 8)}` : ''),
    client_address: base.client_address || empty(client?.preferences?.locations?.[0]),
    client_phone: base.client_phone || '',
    client_email: base.client_email || '',
    agent_name: base.agent_name || (agent ? `Agent #${agent.id}` : ''),
    property_address: base.property_address || address,
    property_type: base.property_type || empty(property?.propertyType),
    property_area: base.property_area || empty(property?.area),
    property_rooms: base.property_rooms || empty(property?.rooms),
    property_price: base.property_price || empty(property?.price),
    property_market: base.property_market || empty(property?.marketType),
    property_legal_status: base.property_legal_status || empty(property?.ownershipStatus),
    property_floor: base.property_floor || empty(property?.floors?.current),
    property_building_type: base.property_building_type || empty(property?.buildingType),
    property_land_area: base.property_land_area || empty(property?.plotArea),
  };
};

export const findMissingRequiredFields = (payload: Record<string, string>, requiredFields: string[]) =>
  requiredFields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
