DROP TABLE IF EXISTS law CASCADE;
DROP TABLE IF EXISTS camera CASCADE;
DROP TABLE IF EXISTS offence CASCADE;

DROP TYPE IF EXISTS camera_type;
DROP TYPE IF EXISTS speed_type;

CREATE TABLE law (
	legislation TEXT,
	section TEXT,
	PRIMARY KEY (legislation, section)
);

CREATE TYPE camera_type AS ENUM ('Red Light / Speed Camera', 'Fixed Digital Speed Camera', 'Mobile Digital Speed Camera', 'Fixed Digital Transit-way Camera', 'Fixed Digital Bus Lane Camera', 'Fixed Point To Point Site Pair');
CREATE TYPE speed_type AS ENUM ('10-', '30+', '20+', '10+', '45+');


CREATE TABLE camera (
	location_code TEXT PRIMARY KEY,
	location_description TEXT,
	type camera_type
);

CREATE TABLE offence (
	code TEXT,
	month DATE,
	law_legislation TEXT,
	law_section TEXT,
	camera TEXT,
	description TEXT,
	red_light BOOLEAN NOT NULL,
	special_vehicle TEXT,
	excess_speed speed_type,
	cases INT NOT NULL,
	total_fine_value INT NOT NULL,
	CONSTRAINT offences_law_fkey FOREIGN KEY (law_legislation, law_section) REFERENCES law (legislation, section) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT offences_camera_location_fkey FOREIGN KEY (camera) REFERENCES camera (location_code) ON UPDATE CASCADE ON DELETE CASCADE,
	PRIMARY KEY (code, month, camera, law_legislation, law_section, red_light)
);